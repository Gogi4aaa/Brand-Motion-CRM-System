-- ============================================================================
-- 0047 — ЗАТВАРЯНЕ НА „auth all“ ДУПКАТА
--
-- До сега clients / invoices / leads / tasks носеха политика
--     create policy "auth all" ... for all using (true)
-- тоест ВСЕКИ логнат акаунт можеше да ЧЕТЕ И ПИШЕ всичко през REST API-то,
-- независимо че NAV_ACCESS крие екраните. Доказано на живо: работник прочете
-- 6 фактури (€2903,50), 6 клиента с MRR (€5007/мес.) и 12 сделки (€4227),
-- и успя да изпълни UPDATE върху фактура и DELETE върху сделка.
--
-- Тази миграция мести правилото от UI в базата.
--
-- ⚠️ `tasks` НАРОЧНО НЕ СЕ ПИПА — виж секция 4 за причината.
-- Идемпотентна е.
-- ============================================================================

-- Помощници: ролята на текущия потребител. SECURITY DEFINER, за да четат
-- profiles без сами да опират в неговата RLS.
create or replace function public.bm_my_role()
returns text
language sql stable security definer set search_path = public
as $$ select coalesce((select p.role from profiles p where p.id = auth.uid()), 'worker') $$;

create or replace function public.bm_my_clients()
returns text[]
language sql stable security definer set search_path = public
as $$ select coalesce((select p.client_ids from profiles p where p.id = auth.uid()), '{}'::text[]) $$;

-- ---------------------------------------------------------------------------
-- 1. ФАКТУРИ — само админ
-- ---------------------------------------------------------------------------
-- Клиентският портал ги чете през portal_get(), която е SECURITY DEFINER и
-- заобикаля RLS — публичната страница продължава да работи.
alter table invoices enable row level security;
drop policy if exists "auth all" on invoices;
drop policy if exists "dev all" on invoices;
drop policy if exists "invoices admin" on invoices;
create policy "invoices admin" on invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. СДЕЛКИ — само админ
-- ---------------------------------------------------------------------------
alter table leads enable row level security;
drop policy if exists "auth all" on leads;
drop policy if exists "dev all" on leads;
drop policy if exists "leads admin" on leads;
create policy "leads admin" on leads for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. КЛИЕНТИ — четене по достъп, писане само от админ
-- ---------------------------------------------------------------------------
-- Работникът трябва да вижда името на клиента върху задачите и продукцията,
-- иначе бордовете остават с празни полета. Затова: клиентите, които са му
-- зададени (profiles.client_ids), плюс тези, по които реално има задача.
-- Мениджърът пази пълната видимост (както visibleClientsFor в кода).
alter table clients enable row level security;
drop policy if exists "auth all" on clients;
drop policy if exists "dev all" on clients;
drop policy if exists "clients read" on clients;
drop policy if exists "clients write" on clients;

create policy "clients read" on clients for select to authenticated
  using (
    public.is_admin()
    or public.bm_my_role() = 'manager'
    or clients.id = any (public.bm_my_clients())
    or exists (
      select 1 from tasks t
      join profiles p on p.initials = t.assignee
      where t.client_id = clients.id and p.id = auth.uid()
    )
  );

create policy "clients write" on clients for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. ЗАДАЧИ — СЪЗНАТЕЛНО ОСТАВЕНИ ОТВОРЕНИ ЗАСЕГА
-- ---------------------------------------------------------------------------
-- Изкушението е да се огледа canSeeTask (private → само админ и изпълнителят).
-- НЕ СТАВА без промяна в кода: ВСИЧКИТЕ 74 стъпка-задачи се създават с
-- visibility='private' (syncStageTask). Ако скрием чуждите частни задачи,
-- работник, който придвижва видео, няма да „вижда“ живата задача на следващия
-- човек и syncStageTask ще създаде ДУБЛИКАТ вместо да я пренасочи.
--
-- Изтичането тук е само заглавия и оценки за време — сумите вече са защитени
-- (task_pay от 0040, video_earnings от 0046). Затваря се, след като
-- syncStageTask започне да минава през SECURITY DEFINER функция.
--
-- Оставяме политиката както е, но я преименуваме, за да не изглежда като
-- недоглеждане при следващия преглед.
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tasks' and policyname='auth all') then
    execute 'alter policy "auth all" on tasks rename to "tasks open (виж 0047 секция 4)"';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Проверка
-- ---------------------------------------------------------------------------
do $$
declare v_bad int;
begin
  select count(*) into v_bad from pg_policies
   where schemaname='public' and tablename in ('invoices','leads','clients')
     and coalesce(qual,'true') = 'true';
  if v_bad > 0 then
    raise exception '0047: остават % отворени политики върху invoices/leads/clients', v_bad;
  end if;
  raise notice '0047: invoices, leads и clients са заключени.';
end $$;
