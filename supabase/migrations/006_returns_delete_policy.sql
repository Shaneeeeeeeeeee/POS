-- Allow admin-only deletion of returns and child return_items.
drop policy if exists "returns_delete_admin" on public.returns;
create policy "returns_delete_admin" on public.returns
for delete to authenticated
using (public.current_profile_role() = 'admin');

drop policy if exists "return_items_delete_admin" on public.return_items;
create policy "return_items_delete_admin" on public.return_items
for delete to authenticated
using (public.current_profile_role() = 'admin');
