-- ============================================================================
-- 0060 — CRM v2: гъвкав пакет за всеки клиент + чеклист за старт.
-- Вече е пусната в базата на 24.11.2026 (apply_migration crm_v2_client_packages).
-- Само добавя — нищо не трие и не сменя.
--   * clients.platforms / services — къде публикуваме и какво включва пакетът
--   * clients.contract_months, website, onboarding (чеклист за достъпи)
--   * client_package_history — кой пакет от кой месец важи (минали месеци пазят стария)
-- ============================================================================
alter table public.clients
  add column if not exists platforms text[] not null default '{}',
  add column if not exists services text[] not null default '{}',
  add column if not exists contract_months integer,
  add column if not exists website text,
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

create table if not exists public.client_package_history (
  id bigserial primary key,
  client_id text not null references public.clients(id) on delete cascade,
  valid_from text not null,
  videos_per_month integer,
  price numeric,
  platforms text[] not null default '{}',
  services text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (client_id, valid_from)
);
alter table public.client_package_history enable row level security;
drop policy if exists "pkg read" on public.client_package_history;
create policy "pkg read" on public.client_package_history for select to authenticated
  using (is_admin() or bm_my_role() = 'manager' or client_id = any (bm_my_clients()));
drop policy if exists "pkg write" on public.client_package_history;
create policy "pkg write" on public.client_package_history for all to authenticated
  using (is_admin()) with check (is_admin());
