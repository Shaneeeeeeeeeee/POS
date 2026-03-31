-- PHOEBE Drugstore — normalized schema (RBAC via profiles.role)
-- Run in Supabase SQL Editor or via CLI after linking the project.

-- ── Profiles (synced from auth) ───────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    'staff',
    true
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- Server-side / seed scripts use service_role JWT (auth.uid() is null).
    if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
      return new;
    end if;
    if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
      raise exception 'Only an admin may change roles';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_profiles_role_guard on public.profiles;
create trigger tr_profiles_role_guard
  before update on public.profiles
  for each row execute function public.enforce_profile_role_change();

-- ── Catalog & suppliers ───────────────────────────────────────────────────
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  price numeric(10, 2) not null,
  stock_quantity integer not null default 0,
  min_stock_level integer default 5,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_info text,
  created_at timestamptz default now()
);

-- ── Restocking ─────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers (id),
  status text not null default 'pending' check (status in ('pending', 'received')),
  created_by uuid references public.profiles (id),
  created_at timestamptz default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id),
  quantity integer not null check (quantity > 0)
);

-- ── Sales ─────────────────────────────────────────────────────────────────
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_number text unique not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid references public.products (id),
  quantity integer not null check (quantity > 0),
  price numeric(10, 2) not null
);

-- ── Returns ───────────────────────────────────────────────────────────────
create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales (id),
  reason text,
  processed_by uuid references public.profiles (id),
  created_at timestamptz default now()
);

create table if not exists public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns (id) on delete cascade,
  product_id uuid references public.products (id),
  quantity integer not null check (quantity > 0),
  action text not null check (action in ('restock', 'dispose', 'exchange'))
);

-- ── Audit ─────────────────────────────────────────────────────────────────
create table if not exists public.inventory_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id),
  change_type text not null check (change_type in ('sale', 'restock', 'return', 'adjustment')),
  quantity_change integer not null,
  reference_id uuid,
  performed_by uuid references public.profiles (id),
  created_at timestamptz default now()
);

-- Optional: batches (FIFO / expiry) — enable when you need traceability
create table if not exists public.product_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id),
  supplier_id uuid references public.suppliers (id),
  order_id uuid references public.orders (id),
  quantity integer not null,
  remaining_quantity integer not null,
  purchase_date date,
  expiration_date date,
  created_at timestamptz default now()
);

-- ── RLS helpers (avoid recursive policy on profiles) ─────────────────────
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_profile_role() from public;
grant execute on function public.current_profile_role() to authenticated;

create or replace function public.is_manager_plus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('admin', 'manager'),
    false
  );
$$;

revoke all on function public.is_manager_plus() from public;
grant execute on function public.is_manager_plus() to authenticated;

-- ── Checkout (atomic sale + stock + logs) ────────────────────────────────
create or replace function public.fn_checkout(p_receipt text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_uid uuid := auth.uid();
  line jsonb;
  pid uuid;
  qty int;
  pr numeric;
  stock int;
  r text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select role into r from profiles where id = v_uid;
  if r is null or r not in ('admin', 'manager', 'staff') then
    raise exception 'forbidden';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty cart';
  end if;

  insert into sales (receipt_number, created_by)
  values (p_receipt, v_uid)
  returning id into v_sale_id;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    pid := (line ->> 'product_id')::uuid;
    qty := (line ->> 'quantity')::int;
    pr := (line ->> 'price')::numeric;
    if qty <= 0 then
      raise exception 'invalid quantity';
    end if;
    select stock_quantity into stock from products where id = pid for update;
    if stock is null then
      raise exception 'product not found: %', pid;
    end if;
    if stock < qty then
      raise exception 'insufficient stock for product %', pid;
    end if;
    insert into sale_items (sale_id, product_id, quantity, price)
    values (v_sale_id, pid, qty, pr);
    update products set stock_quantity = stock_quantity - qty where id = pid;
    insert into inventory_logs (product_id, change_type, quantity_change, reference_id, performed_by)
    values (pid, 'sale', -qty, v_sale_id, v_uid);
  end loop;

  return v_sale_id;
end;
$$;

revoke all on function public.fn_checkout(text, jsonb) from public;
grant execute on function public.fn_checkout(text, jsonb) to authenticated;

-- ── Receive restock order ─────────────────────────────────────────────────
create or replace function public.fn_receive_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r text;
  o record;
  it record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select role into r from profiles where id = v_uid;
  if r is null or r not in ('admin', 'manager') then
    raise exception 'forbidden';
  end if;
  select * into o from orders where id = p_order_id for update;
  if o.id is null then raise exception 'order not found'; end if;
  if o.status = 'received' then raise exception 'already received'; end if;

  for it in select * from order_items where order_id = p_order_id
  loop
    update products
    set stock_quantity = stock_quantity + it.quantity
    where id = it.product_id;
    insert into inventory_logs (product_id, change_type, quantity_change, reference_id, performed_by)
    values (it.product_id, 'restock', it.quantity, p_order_id, v_uid);
  end loop;

  update orders set status = 'received' where id = p_order_id;
end;
$$;

revoke all on function public.fn_receive_order(uuid) from public;
grant execute on function public.fn_receive_order(uuid) to authenticated;

-- ── Process return (restock path adds inventory) ─────────────────────────
create or replace function public.fn_process_return(
  p_sale_id uuid,
  p_reason text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r text;
  v_ret_id uuid;
  line jsonb;
  pid uuid;
  qty int;
  act text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select role into r from profiles where id = v_uid;
  if r is null or r not in ('admin', 'manager') then
    raise exception 'forbidden';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty return';
  end if;

  insert into returns (sale_id, reason, processed_by)
  values (p_sale_id, p_reason, v_uid)
  returning id into v_ret_id;

  for line in select * from jsonb_array_elements(p_items)
  loop
    pid := (line ->> 'product_id')::uuid;
    qty := (line ->> 'quantity')::int;
    act := line ->> 'action';
    if qty <= 0 then raise exception 'invalid quantity'; end if;
    insert into return_items (return_id, product_id, quantity, action)
    values (v_ret_id, pid, qty, act);
    if act = 'restock' then
      update products set stock_quantity = stock_quantity + qty where id = pid;
      insert into inventory_logs (product_id, change_type, quantity_change, reference_id, performed_by)
      values (pid, 'return', qty, v_ret_id, v_uid);
    end if;
  end loop;

  return v_ret_id;
end;
$$;

revoke all on function public.fn_process_return(uuid, text, jsonb) from public;
grant execute on function public.fn_process_return(uuid, text, jsonb) to authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.inventory_logs enable row level security;
alter table public.product_batches enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_profile_role() = 'admin');

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update to authenticated
  using (public.current_profile_role() = 'admin')
  with check (public.current_profile_role() = 'admin');

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "products_read" on public.products;
create policy "products_read" on public.products for select to authenticated using (true);

drop policy if exists "products_write_mgr" on public.products;
create policy "products_write_mgr" on public.products for insert to authenticated
  with check (public.is_manager_plus());
create policy "products_update_mgr" on public.products for update to authenticated
  using (public.is_manager_plus()) with check (public.is_manager_plus());
create policy "products_delete_mgr" on public.products for delete to authenticated
  using (public.is_manager_plus());

drop policy if exists "suppliers_all" on public.suppliers;
create policy "suppliers_read" on public.suppliers for select to authenticated using (true);
create policy "suppliers_write" on public.suppliers for insert to authenticated with check (public.is_manager_plus());
create policy "suppliers_update" on public.suppliers for update to authenticated using (public.is_manager_plus()) with check (public.is_manager_plus());
create policy "suppliers_delete" on public.suppliers for delete to authenticated using (public.is_manager_plus());

drop policy if exists "orders_read" on public.orders;
create policy "orders_read" on public.orders for select to authenticated using (true);
create policy "orders_insert" on public.orders for insert to authenticated with check (public.is_manager_plus());
create policy "orders_update" on public.orders for update to authenticated using (public.is_manager_plus()) with check (public.is_manager_plus());

drop policy if exists "order_items_all" on public.order_items;
create policy "order_items_read" on public.order_items for select to authenticated using (true);
create policy "order_items_write" on public.order_items for insert to authenticated with check (public.is_manager_plus());
create policy "order_items_update" on public.order_items for update to authenticated using (public.is_manager_plus()) with check (public.is_manager_plus());
create policy "order_items_delete" on public.order_items for delete to authenticated using (public.is_manager_plus());

drop policy if exists "sales_read" on public.sales;
create policy "sales_read" on public.sales for select to authenticated using (true);

drop policy if exists "sale_items_read" on public.sale_items;
create policy "sale_items_read" on public.sale_items for select to authenticated using (true);

drop policy if exists "returns_read" on public.returns;
create policy "returns_read" on public.returns for select to authenticated using (true);

drop policy if exists "return_items_read" on public.return_items;
create policy "return_items_read" on public.return_items for select to authenticated using (true);

drop policy if exists "logs_read" on public.inventory_logs;
create policy "logs_read" on public.inventory_logs for select to authenticated using (public.is_manager_plus());

drop policy if exists "logs_insert_mgr_adjustment" on public.inventory_logs;
create policy "logs_insert_mgr_adjustment" on public.inventory_logs for insert to authenticated
  with check (
    public.is_manager_plus()
    and change_type = 'adjustment'
  );

drop policy if exists "batches_read" on public.product_batches;
create policy "batches_read" on public.product_batches for select to authenticated using (true);
create policy "batches_write" on public.product_batches for all to authenticated using (public.is_manager_plus()) with check (public.is_manager_plus());

-- Writes to sales / sale_items / return side of inventory_logs: RPCs only.
-- Manual stock corrections: inventory_logs.insert (adjustment) for manager+.
