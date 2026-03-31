-- Allow managers/admins to delete pending purchase orders (RLS).
-- Needed for "Delete (not ordered)" in Restock.

create policy "orders_delete"
on public.orders
for delete
to authenticated
using (public.is_manager_plus());

