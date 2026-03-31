create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_read_admin" on public.app_settings;
create policy "app_settings_read_admin" on public.app_settings
for select to authenticated
using (public.current_profile_role() = 'admin');

drop policy if exists "app_settings_write_admin" on public.app_settings;
create policy "app_settings_write_admin" on public.app_settings
for all to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');
