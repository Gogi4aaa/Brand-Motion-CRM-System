-- ============================================================================
-- BrandMotion CRM — Supabase schema + seed
-- Run this in the Supabase dashboard → SQL Editor → New query → Run.
-- Safe to re-run: it drops and recreates the three tables.
-- ============================================================================

drop table if exists tasks cascade;
drop table if exists invoices cascade;
drop table if exists clients cascade;

-- ---- Clients ---------------------------------------------------------------
create table clients (
  id        text primary key,
  name      text not null,
  initials  text not null,
  industry  text not null,
  status    text not null check (status in ('Active','At risk','Onboarding')),
  mrr       integer not null default 0,
  owner     text not null,
  health    text not null check (health in ('good','watch','risk')),
  note      text not null default '',
  created_at timestamptz not null default now()
);

-- ---- Invoices --------------------------------------------------------------
create table invoices (
  id        text primary key,
  client_id text not null references clients(id) on delete cascade,
  amount    integer not null default 0,
  status    text not null check (status in ('paid','pending','overdue','draft')),
  issued    text not null default '',
  due       text not null default '—',
  created_at timestamptz not null default now()
);

-- ---- Tasks -----------------------------------------------------------------
create table tasks (
  id        text primary key,
  title     text not null,
  client_id text not null references clients(id) on delete cascade,
  status    text not null check (status in ('todo','inprogress','review','done')),
  priority  text not null check (priority in ('high','medium','low')),
  assignee  text not null default 'GD',
  due       text not null default 'Soon',
  progress  integer not null default 0,
  created_at timestamptz not null default now()
);

create index on invoices (client_id);
create index on tasks (client_id);

-- ---- Row Level Security ----------------------------------------------------
-- DEV policy: allow the anon key full access so the app works before auth is
-- added. TIGHTEN THIS once Supabase Auth lands — replace the permissive
-- policies with authenticated-only / role-based rules.
alter table clients  enable row level security;
alter table invoices enable row level security;
alter table tasks    enable row level security;

create policy "dev all" on clients  for all using (true) with check (true);
create policy "dev all" on invoices for all using (true) with check (true);
create policy "dev all" on tasks    for all using (true) with check (true);

-- (Seed data removed — start with a clean database.)
