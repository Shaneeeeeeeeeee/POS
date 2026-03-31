-- Account status for admin (soft block without deleting auth user)
alter table public.profiles
  add column if not exists is_active boolean not null default true;

comment on column public.profiles.is_active is 'When false, app signs user out and blocks dashboard access.';

update public.profiles set is_active = true where is_active is null;
