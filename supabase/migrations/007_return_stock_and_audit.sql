-- Track sellable return stock separately and audit return lifecycle.

alter table public.products
  add column if not exists return_stock_quantity integer not null default 0;

alter table public.products
  drop constraint if exists products_return_stock_nonnegative;
alter table public.products
  add constraint products_return_stock_nonnegative check (return_stock_quantity >= 0);

alter table public.sale_items
  add column if not exists source_type text not null default 'regular';

alter table public.sale_items
  drop constraint if exists sale_items_source_type_check;
alter table public.sale_items
  add constraint sale_items_source_type_check check (source_type in ('regular', 'return'));

create table if not exists public.return_audit_events (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  return_id uuid references public.returns (id) on delete set null,
  event_type text not null check (event_type in ('processed', 'deleted')),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.return_audit_events enable row level security;

drop policy if exists "return_audit_read" on public.return_audit_events;
create policy "return_audit_read" on public.return_audit_events
for select to authenticated
using (true);

drop policy if exists "return_audit_insert_mgr" on public.return_audit_events;
create policy "return_audit_insert_mgr" on public.return_audit_events
for insert to authenticated
with check (public.is_manager_plus());

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
  return_stock int;
  src text;
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
    src := coalesce(line ->> 'source', 'regular');
    if qty <= 0 then
      raise exception 'invalid quantity';
    end if;

    select stock_quantity, return_stock_quantity
      into stock, return_stock
      from products
      where id = pid
      for update;

    if stock is null then
      raise exception 'product not found: %', pid;
    end if;
    if stock < qty then
      raise exception 'insufficient stock for product %', pid;
    end if;

    if src = 'return' then
      if return_stock < qty then
        raise exception 'insufficient return stock for product %', pid;
      end if;
      update products
      set stock_quantity = stock_quantity - qty,
          return_stock_quantity = return_stock_quantity - qty
      where id = pid;
    else
      update products
      set stock_quantity = stock_quantity - qty
      where id = pid;
      src := 'regular';
    end if;

    insert into sale_items (sale_id, product_id, quantity, price, source_type)
    values (v_sale_id, pid, qty, pr, src);

    insert into inventory_logs (product_id, change_type, quantity_change, reference_id, performed_by)
    values (pid, 'sale', -qty, v_sale_id, v_uid);
  end loop;

  return v_sale_id;
end;
$$;

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
    if act not in ('restock', 'dispose', 'exchange') then
      raise exception 'invalid return action';
    end if;

    insert into return_items (return_id, product_id, quantity, action)
    values (v_ret_id, pid, qty, act);

    if act in ('restock', 'exchange') then
      update products
      set stock_quantity = stock_quantity + qty,
          return_stock_quantity = return_stock_quantity + qty
      where id = pid;
      insert into inventory_logs (product_id, change_type, quantity_change, reference_id, performed_by)
      values (pid, 'return', qty, v_ret_id, v_uid);
    end if;
  end loop;

  return v_ret_id;
end;
$$;
