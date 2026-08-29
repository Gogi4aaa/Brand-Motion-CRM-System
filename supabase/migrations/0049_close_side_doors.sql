-- ============================================================================
-- 0049 — ЗАТВАРЯНЕ НА СТРАНИЧНИТЕ ВРАТИ КЪМ ПАРИТЕ
--
-- 0047 заключи invoices/leads/clients, но две таблици продължаваха да пропускат
-- същата информация по околен път. Доказано на живо като работник (NI):
--
--   notifications  → 146 чужди известия, вкл. „Плащане към теб е отбелязано:
--                    €300 за 3 задачи" — сумите на колегите, точно това, което
--                    task_pay и video_earnings пазят.
--   client_portals → 5 токена. С токен се отваря /portal/<token>, а порталът
--                    показва месечна такса, платено общо, чакащо и последните
--                    12 фактури — обходен път около заключените invoices.
--
-- ⚠️ `approvals` НЕ се пипа: ContentModal го чете и работниците го отварят от
-- Продукция. Токенът там е id-то на реда, така че затварянето иска промяна в
-- UI (да не се дърпа целият ред). Рискът е integrity (чуждо одобрение), не пари.
--
-- Идемпотентна.
-- ============================================================================

create or replace function public.bm_my_initials()
returns text
language sql stable security definer set search_path = public
as $$ select coalesce((select p.initials from profiles p where p.id = auth.uid()), '') $$;

-- ---------------------------------------------------------------------------
-- 1. ИЗВЕСТИЯ — всеки чете само своите
-- ---------------------------------------------------------------------------
-- INSERT остава отворен: notify() пише известие НА ДРУГ човек (възложена
-- задача, отбелязано плащане). Това е нормалната работа на приложението.
alter table notifications enable row level security;
drop policy if exists "auth all" on notifications;
drop policy if exists "notifications read" on notifications;
drop policy if exists "notifications insert" on notifications;
drop policy if exists "notifications update" on notifications;
drop policy if exists "notifications delete" on notifications;

create policy "notifications read" on notifications for select to authenticated
  using (public.is_admin() or recipient = public.bm_my_initials());

create policy "notifications insert" on notifications for insert to authenticated
  with check (true);

create policy "notifications update" on notifications for update to authenticated
  using (public.is_admin() or recipient = public.bm_my_initials())
  with check (public.is_admin() or recipient = public.bm_my_initials());

create policy "notifications delete" on notifications for delete to authenticated
  using (public.is_admin() or recipient = public.bm_my_initials());

-- ---------------------------------------------------------------------------
-- 2. ПОРТАЛНИ ТОКЕНИ — само админ
-- ---------------------------------------------------------------------------
-- Единственият вътрешен четец е getPortalLink() от екрана Клиенти (admin-only).
-- Публичната страница минава през portal_get(), която е SECURITY DEFINER и не
-- опира в тази политика.
alter table client_portals enable row level security;
drop policy if exists "auth all" on client_portals;
drop policy if exists "client_portals admin" on client_portals;
create policy "client_portals admin" on client_portals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. PUSH АБОНАМЕНТИ — само своите
-- ---------------------------------------------------------------------------
-- Изпращачът е /api/push/send със service role ключ, тоест заобикаля RLS.
alter table push_subscriptions enable row level security;
drop policy if exists "auth all" on push_subscriptions;
drop policy if exists "push own" on push_subscriptions;
create policy "push own" on push_subscriptions for all to authenticated
  using (public.is_admin() or recipient = public.bm_my_initials())
  with check (public.is_admin() or recipient = public.bm_my_initials());

-- ---------------------------------------------------------------------------
-- 4. Проверка
-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from pg_policies
   where schemaname='public' and tablename in ('notifications','client_portals','push_subscriptions')
     and cmd = 'SELECT' and coalesce(qual,'true') = 'true';
  if v > 0 then raise exception '0049: остават % отворени SELECT политики', v; end if;
  raise notice '0049: известията, порталните токени и push абонаментите са заключени.';
end $$;
