-- ============================================================================
-- Phase 4 — Campaigns + time tracking on tasks.
-- ============================================================================

create table if not exists campaigns (
  id         text primary key,
  name       text not null,
  client_id  text not null references clients(id) on delete cascade,
  status     text not null check (status in ('planning','active','paused','completed')),
  channel    text not null default '',
  budget     integer not null default 0,
  starts     text not null default '',
  ends       text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists campaigns_client_idx on campaigns (client_id);

alter table campaigns enable row level security;
drop policy if exists "auth all" on campaigns;
create policy "auth all" on campaigns for all to authenticated using (true) with check (true);

-- Time tracking: total logged seconds per task.
alter table tasks add column if not exists time_logged integer not null default 0;
