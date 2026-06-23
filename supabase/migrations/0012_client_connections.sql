-- ============================================================================
-- Per-client channel connections (organic posting: Meta Pages+IG, TikTok).
-- Stores only connection METADATA (status + account label). Real OAuth tokens
-- must live server-side, encrypted (service-role only) — never in this table.
-- ============================================================================

create table if not exists client_connections (
  client_id     text not null references clients(id) on delete cascade,
  provider      text not null check (provider in ('meta','tiktok')),
  connected     boolean not null default false,
  account_label text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (client_id, provider)
);

alter table client_connections enable row level security;
drop policy if exists "auth all" on client_connections;
create policy "auth all" on client_connections for all to authenticated using (true) with check (true);
