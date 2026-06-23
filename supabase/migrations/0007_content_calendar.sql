-- ============================================================================
-- Content calendar — per-client, colour-coded content items.
-- ============================================================================

create table if not exists content_items (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  date       date not null,
  type       text not null check (type in ('promo','info','reel','project','post')),
  title      text not null default '',
  notes      text not null default '',
  notion_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists content_items_client_date_idx on content_items (client_id, date);

alter table content_items enable row level security;
drop policy if exists "auth all" on content_items;
create policy "auth all" on content_items for all to authenticated using (true) with check (true);
