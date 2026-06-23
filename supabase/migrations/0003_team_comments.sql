-- ============================================================================
-- Phase 3 — Comments + role bootstrap.
-- ============================================================================

-- ---- Comments (on clients or tasks) ----------------------------------------
create table if not exists comments (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null check (entity_type in ('client','task')),
  entity_id       text not null,
  author_name     text not null default '',
  author_initials text not null default '',
  body            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists comments_entity_idx on comments (entity_type, entity_id, created_at);

alter table comments enable row level security;
drop policy if exists "auth all" on comments;
create policy "auth all" on comments for all to authenticated using (true) with check (true);

-- ---- Promote the first user to admin if no admin exists yet -----------------
update profiles
set role = 'admin'
where id = (select id from profiles order by created_at asc limit 1)
  and not exists (select 1 from profiles where role = 'admin');
