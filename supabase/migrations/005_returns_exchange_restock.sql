-- Restock inventory for both restock + exchange return actions.
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
      update products set stock_quantity = stock_quantity + qty where id = pid;
      insert into inventory_logs (product_id, change_type, quantity_change, reference_id, performed_by)
      values (pid, 'return', qty, v_ret_id, v_uid);
    end if;
  end loop;

  return v_ret_id;
end;
$$;
