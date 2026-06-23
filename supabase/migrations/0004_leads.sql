-- ============================================================================
-- Phase 4 — Sales pipeline (leads).
-- ============================================================================

create table if not exists leads (
  id         text primary key,
  name       text not null,
  contact    text not null default '',
  value      integer not null default 0,
  stage      text not null check (stage in ('new','contacted','proposal','won','lost')),
  owner      text not null default 'GD',
  created_at timestamptz not null default now()
);

alter table leads enable row level security;
drop policy if exists "auth all" on leads;
create policy "auth all" on leads for all to authenticated using (true) with check (true);
