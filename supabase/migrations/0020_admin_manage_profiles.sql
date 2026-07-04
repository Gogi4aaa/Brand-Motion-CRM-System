-- ============================================================================
-- Fix: role / production-roles / client-access edits on the Team page never
-- saved. The only UPDATE policy on profiles was "update own" (auth.uid() = id),
-- so an admin editing ANOTHER member's row matched 0 rows — Supabase reports
-- that as success, which is why it failed silently.
--
-- is_admin() is SECURITY DEFINER to avoid recursive RLS (a profiles policy
-- can't select from profiles directly).
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "profiles admin update" on profiles;
create policy "profiles admin update" on profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
