-- ============================================================================
-- Phase 2 — Activity log. One row per notable action; powers the dashboard feed.
-- ============================================================================

create table if not exists activity (
  id              uuid primary key default gen_random_uuid(),
  actor_name      text not null default '',
  actor_initials  text not null default '',
  action          text not null,
  created_at      timestamptz not null default now()
);

create index if not exists activity_created_at_idx on activity (created_at desc);

alter table activity enable row level security;

drop policy if exists "auth all" on activity;
create policy "auth all" on activity for all to authenticated using (true) with check (true);
