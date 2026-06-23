-- ============================================================================
-- Monthly content cycle per client — the high-level "where are we this month"
-- tracker that sits ABOVE the per-video production board.
--   phase: ideas -> scripts -> production -> published
--   * onboarding / a new month opens a cycle at 'ideas' (strategist notified)
--   * importing the .docx flips it to 'production' and creates the video cards
-- content_items.cycle_id links the videos created on import back to their cycle.
-- ============================================================================

create table if not exists content_cycles (
  id           text primary key,
  client_id    text not null references clients(id) on delete cascade,
  month        text not null,                 -- 'YYYY-MM'
  target_count integer not null default 0,    -- planned videos for the month
  phase        text not null default 'ideas'
               check (phase in ('ideas','scripts','production','published')),
  created_at   timestamptz not null default now()
);
create index if not exists content_cycles_client_idx on content_cycles (client_id, month);

alter table content_cycles enable row level security;
drop policy if exists "auth all" on content_cycles;
create policy "auth all" on content_cycles for all to authenticated using (true) with check (true);

alter table content_items add column if not exists cycle_id text;
