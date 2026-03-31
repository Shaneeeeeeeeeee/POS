-- Allow profile.role updates when called with service_role (Admin API / seeds).
-- Replaces trigger function from 001_init.sql for existing databases.

create or replace function public.enforce_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
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
