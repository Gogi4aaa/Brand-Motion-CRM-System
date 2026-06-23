-- ============================================================================
-- Phase 5 — Integrations hub, Meta ad drafts, social/video posts.
-- External publishing is simulated until OAuth + provider API tokens are wired
-- server-side; these tables hold the in-app state (connections, drafts, queue).
-- ============================================================================

-- ---- Connected accounts ----------------------------------------------------
create table if not exists integrations (
  provider      text primary key,            -- 'meta_ads' | 'instagram' | 'tiktok' | 'youtube'
  connected     boolean not null default false,
  account_label text not null default '',
  updated_at    timestamptz not null default now()
);

alter table integrations enable row level security;
drop policy if exists "auth all" on integrations;
create policy "auth all" on integrations for all to authenticated using (true) with check (true);

insert into integrations (provider) values ('meta_ads'), ('instagram'), ('tiktok'), ('youtube')
on conflict (provider) do nothing;

-- ---- Meta ad campaign drafts -----------------------------------------------
create table if not exists ad_drafts (
  id           text primary key,
  client_id    text references clients(id) on delete set null,
  name         text not null,
  objective    text not null default 'traffic',
  budget       integer not null default 0,
  audience     text not null default '',
  primary_text text not null default '',
  headline     text not null default '',
  status       text not null check (status in ('draft','ready','published')) default 'draft',
  created_at   timestamptz not null default now()
);

alter table ad_drafts enable row level security;
drop policy if exists "auth all" on ad_drafts;
create policy "auth all" on ad_drafts for all to authenticated using (true) with check (true);

-- ---- Social / video posts (multi-platform) ---------------------------------
create table if not exists social_posts (
  id            text primary key,
  caption       text not null default '',
  media_url     text not null default '',
  platforms     text[] not null default '{}',
  scheduled_for text not null default '',
  status        text not null check (status in ('draft','scheduled','published')) default 'draft',
  created_at    timestamptz not null default now()
);

alter table social_posts enable row level security;
drop policy if exists "auth all" on social_posts;
create policy "auth all" on social_posts for all to authenticated using (true) with check (true);
