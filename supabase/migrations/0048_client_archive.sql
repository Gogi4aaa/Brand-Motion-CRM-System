-- ============================================================================
-- 0048 — АРХИВИРАНЕ НА КЛИЕНТ ВМЕСТО ТРИЕНЕ
--
-- Проблемът: `delete from clients` каскадно трие 12 таблици, включително
-- ФАКТУРИТЕ. На 28.08.2026 бяха изтрити двама клиента (Евро Програми и Viktor
-- Dandanov) и с тях изчезнаха 10 видеа, 11 задачи и фактура за €350.
-- Приходът в Анализи падна от €3253,50 на €2903,50 — не защото парите не са
-- влезли, а защото записът за тях вече го няма.
--
-- Счетоводна истина: платена фактура е ИСТОРИЧЕСКИ ФАКТ. Клиентът може да си
-- тръгне; парите, които е платил, остават. Затова:
--   1. клиентът се АРХИВИРА (archived_at), не се трие
--   2. фактурите му вече не могат да бъдат изтрити каскадно (RESTRICT)
--
-- Идемпотентна.
-- ============================================================================

-- ---- 1. Архивен маркер ------------------------------------------------------
alter table clients add column if not exists archived_at timestamptz;
comment on column clients.archived_at is
  'Кога клиентът е архивиран. Не null = скрит от списъците, но историята му остава в Анализи.';
create index if not exists clients_archived_idx on clients (archived_at) where archived_at is null;

-- ---- 2. Фактурите вече не се трият заедно с клиента -------------------------
-- RESTRICT: опит за триене на клиент с фактури връща грешка, вместо тихо да
-- отнесе приходната история. Приложението и без това вече архивира.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'invoices'::regclass and contype = 'f' and confrelid = 'clients'::regclass;
  if v_name is not null then
    execute format('alter table invoices drop constraint %I', v_name);
  end if;
  alter table invoices
    add constraint invoices_client_id_fkey
    foreign key (client_id) references clients(id) on delete restrict;
end $$;

-- ---- 3. Архивирането е операция на админа ----------------------------------
create or replace function public.bm_archive_client(p_client text, p_archived boolean default true)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Само админ може да архивира клиенти'; end if;
  update clients set archived_at = case when p_archived then now() else null end
   where id = p_client;
  if not found then raise exception 'Клиентът не съществува'; end if;
end $$;

-- ---- 4. Пълно изтриване — само когато няма финансова следа ------------------
-- Оставяме път за истинско триене (сгрешен запис отпреди минута), но само ако
-- клиентът няма нито една фактура. Иначе — архивирай.
create or replace function public.bm_delete_client(p_client text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_inv int;
begin
  if not public.is_admin() then raise exception 'Само админ може да трие клиенти'; end if;
  select count(*) into v_inv from invoices where client_id = p_client;
  if v_inv > 0 then
    raise exception 'Клиентът има % фактури — архивирай го вместо да го триеш, за да не се загуби приходната история.', v_inv;
  end if;
  delete from clients where id = p_client;
end $$;

-- ---- 5. Проверка ------------------------------------------------------------
do $$
declare v_del char;
begin
  select confdeltype into v_del from pg_constraint
   where conrelid='invoices'::regclass and contype='f' and confrelid='clients'::regclass;
  if v_del <> 'r' then
    raise exception '0048: invoices.client_id още е % вместо RESTRICT', v_del;
  end if;
  raise notice '0048: фактурите са защитени, clients.archived_at е налична.';
end $$;
