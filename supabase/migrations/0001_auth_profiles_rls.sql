-- ============================================================================
-- Phase 1 — Auth: profiles table, auto-provisioning trigger, locked-down RLS.
-- Run AFTER schema.sql, in Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- ---- Profiles (one row per auth user) --------------------------------------
create table if not exists profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  name      text not null default '',
  initials  text not null default '',
  role      text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles read (auth)" on profiles;
drop policy if exists "profiles update own" on profiles;
create policy "profiles read (auth)"  on profiles for select to authenticated using (true);
create policy "profiles update own"   on profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ---- Auto-create a profile whenever a user signs up ------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'name', new.email), 2))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already exist.
insert into public.profiles (id, name, initials)
select id,
       coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1)),
       upper(left(coalesce(raw_user_meta_data->>'name', email), 2))
from auth.users
on conflict (id) do nothing;

-- ---- Lock down the core tables: authenticated-only ------------------------
-- Replaces the permissive dev policies from schema.sql.
drop policy if exists "dev all" on clients;
drop policy if exists "dev all" on invoices;
drop policy if exists "dev all" on tasks;

drop policy if exists "auth all" on clients;
drop policy if exists "auth all" on invoices;
drop policy if exists "auth all" on tasks;

create policy "auth all" on clients  for all to authenticated using (true) with check (true);
create policy "auth all" on invoices for all to authenticated using (true) with check (true);
create policy "auth all" on tasks    for all to authenticated using (true) with check (true);
