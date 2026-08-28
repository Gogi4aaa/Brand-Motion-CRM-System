-- ============================================================================
-- 0046 — ПЛАЩАНЕ ПО ВИДЕО (заменя начисляването по етап от 0040/0041)
--
-- Единицата на заплащане е (видео × човек × роля), уникална в базата — НЕ етап.
-- Симптомът, който го наложи: един монтажист получаваше 4 реда за 2 видеа,
-- защото „Монтаж“ и „Преглед“ са два етапа, но една платена роля.
--
-- Съдържание:
--   1. pay_roles / stage_roles   — няколко етапа → една платена роля
--   2. video_rates + bm_video_price — цена по човек · роля · клиент, с история
--   3. video_earnings            — един ред на (видео, човек, роля)
--   4. worker_packages           — N видеа за X€, плаща се наведнъж
--   5. payouts                   — плащане с дата, метод, референция, отменяемо
--   6. тригер                    — начислява и „дължи“ автоматично от tasks
--   7. пренос + свиване на дубликатите от task_pay
--   8. v_worker_owed             — редът на човека в екрана Възнаграждения
--   9. RPC функции за фронтенда
--  10. RLS, grants, realtime
--
-- Идемпотентна: безопасно е да се пусне повторно.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ПЛАТЕНИ РОЛИ  ·  ⚠️ ЕДИНСТВЕНОТО, КОЕТО ТРЯБВА ДА ПРОВЕРИШ ПРЕДИ ПУСКАНЕ
-- ---------------------------------------------------------------------------
-- Етап без ред в `stage_roles` НЕ струва пари. Ключовият ред е ('review','editor'):
-- преглед и монтаж стават ЕДНА роля → ЕДИН ред за видео. Ако не искаш да плащаш
-- публикуването — изтрий реда ('publish','publisher').
create table if not exists pay_roles (
  key   text primary key,
  label text not null,
  sort  int  not null default 0
);

insert into pay_roles (key, label, sort) values
  ('strategist',   'Стратег',        1),
  ('scriptwriter', 'Сценарист',      2),
  ('videographer', 'Видеограф',      3),
  ('editor',       'Монтажист',      4),
  ('poster',       'Пост криейтър',  5),
  ('publisher',    'Публикуващ',     6)
on conflict (key) do update set label = excluded.label, sort = excluded.sort;

create table if not exists stage_roles (
  stage_key text primary key,
  role_key  text not null references pay_roles(key) on delete cascade
);

-- Реалните stage_key от приложението (lib/data.ts: PRODUCTION_STAGES + POST_STAGES).
insert into stage_roles (stage_key, role_key) values
  ('strategy', 'strategist'),
  ('script',   'scriptwriter'),
  ('shoot',    'videographer'),
  ('edit',     'editor'),
  ('review',   'editor'),     -- ← преглед се плаща като част от монтажа
  ('publish',  'publisher'),
  ('copy',     'poster'),
  ('design',   'poster')      -- ← текст и дизайн са една роля за постовете
on conflict (stage_key) do update set role_key = excluded.role_key;

-- ---------------------------------------------------------------------------
-- 2. ЦЕНИ — по човек, роля и клиент, с история
-- ---------------------------------------------------------------------------
-- Смяна на цена = НОВ ред с по-нов valid_from. Старите редове остават, за да
-- може да се докаже каква е била цената тогава. Вече заработените video_earnings
-- си пазят своята цена завинаги (тя се копира в реда при начисляване).
create table if not exists video_rates (
  id         bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  role_key   text references pay_roles(key) on delete cascade,  -- null = всяка роля
  client_id  text references clients(id) on delete cascade,     -- null = всеки клиент
  price      numeric(12,2) not null check (price >= 0),
  valid_from timestamptz not null default now(),
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists video_rates_lookup_idx on video_rates (profile_id, valid_from desc);

-- Приоритет на съвпадението: клиент(4) + роля(2). При равенство — по-новият ред.
-- Пада обратно към старата worker_rates.rate, после към €15.
create or replace function public.bm_video_price(p_profile uuid, p_role text, p_client text default null)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select r.price
       from video_rates r
      where r.profile_id = p_profile
        and (r.role_key  is null or r.role_key  = p_role)
        and (r.client_id is null or r.client_id = p_client)
        and r.valid_from <= now()
      order by ((case when r.client_id is not null then 4 else 0 end)
              + (case when r.role_key  is not null then 2 else 0 end)) desc,
               r.valid_from desc, r.id desc
      limit 1),
    (select wr.rate from worker_rates wr where wr.profile_id = p_profile),
    15
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. ПЛАЩАНИЯ (дефинира се преди earnings заради FK)
-- ---------------------------------------------------------------------------
create table if not exists payouts (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  amount     numeric(12,2) not null,
  method     text,          -- bank | cash | revolut | wise | …
  reference  text,          -- номер на превод / бележка
  note       text,
  paid_at    timestamptz not null default now(),
  created_by uuid,
  voided_at  timestamptz,   -- отменено плащане (не се трие — остава в историята)
  voided_by  uuid,
  created_at timestamptz not null default now()
);
create index if not exists payouts_profile_idx on payouts (profile_id, paid_at desc);

-- ---------------------------------------------------------------------------
-- 4. ПАКЕТИ — N видеа за X€, плаща се наведнъж при завършване
-- ---------------------------------------------------------------------------
create table if not exists worker_packages (
  id           bigserial primary key,
  profile_id   uuid not null references profiles(id) on delete cascade,
  label        text not null default '',
  target_count int  not null check (target_count > 0),
  total_price  numeric(12,2) not null check (total_price >= 0),
  role_key     text references pay_roles(key) on delete set null,  -- null = всяка роля
  client_id    text references clients(id) on delete set null,     -- null = всеки клиент
  status       text not null default 'open'
               check (status in ('open','completed','paid','cancelled')),
  completed_at timestamptz,
  payout_id    uuid references payouts(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists worker_packages_profile_idx on worker_packages (profile_id, status);

-- ---------------------------------------------------------------------------
-- 3. ЗАРАБОТЕНО — ЕДИН ред на (видео × човек × роля)
-- ---------------------------------------------------------------------------
-- `earned_at` се пълни, когато човекът си свърши НЕГОВАТА част (всичките му
-- задачи по тази роля за това видео са done). Не чака публикуване или одобрение
-- от клиента — работим с фрийлансъри и задържането на чужди пари руши доверие.
-- Преправка се решава с отрицателен ред следващия месец.
-- `on delete set null`, а НЕ cascade: ако видеото бъде изтрито, свършената работа
-- пак е свършена и парите пак се дължат. Затова пазим и заглавието в реда
-- (`content_title`) — редът остава четим и след като видеото го няма.
-- `legacy_item_id` държи стария id за осиротелите редове (виж секция 7).
create table if not exists video_earnings (
  id              bigserial primary key,
  content_item_id text references content_items(id) on delete set null,
  content_title   text not null default '',
  legacy_item_id  text,
  profile_id      uuid not null references profiles(id) on delete cascade,
  role_key        text not null references pay_roles(key) on delete cascade,
  client_id       text references clients(id) on delete set null,
  price           numeric(12,2) not null default 0,
  price_locked    boolean not null default false,  -- ръчна цена — тарифата не я пипа
  earned_at       timestamptz,                     -- not null = дължимо
  package_id      bigint references worker_packages(id) on delete set null,
  payout_id       uuid references payouts(id) on delete set null,
  created_at      timestamptz not null default now()
);
-- Надграждане на таблица, останала от по-ранен пробег на миграцията.
alter table video_earnings add column if not exists content_title  text not null default '';
alter table video_earnings add column if not exists legacy_item_id text;
alter table video_earnings alter column content_item_id drop not null;
do $$ begin
  alter table video_earnings drop constraint if exists video_earnings_content_item_id_fkey;
  alter table video_earnings add constraint video_earnings_content_item_id_fkey
    foreign key (content_item_id) references content_items(id) on delete set null;
  alter table video_earnings drop constraint if exists video_earnings_content_item_id_profile_id_role_key_key;
end $$;

-- ← това убива дубликатите. Частичен индекс, защото осиротелите редове нямат
-- content_item_id и се пазят по legacy_item_id.
create unique index if not exists video_earnings_uniq
  on video_earnings (content_item_id, profile_id, role_key) where content_item_id is not null;
create unique index if not exists video_earnings_legacy_uniq
  on video_earnings (legacy_item_id, profile_id, role_key) where legacy_item_id is not null;
create index if not exists video_earnings_profile_idx on video_earnings (profile_id, earned_at);
create index if not exists video_earnings_payout_idx  on video_earnings (payout_id);
create index if not exists video_earnings_package_idx on video_earnings (package_id);

-- ---- Пакетна логика --------------------------------------------------------
-- Видеата по пакет само придвижват прогреса и НИКОГА не стават поотделно дължими.
create or replace function public.bm_refresh_package(p_package bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_pkg worker_packages; v_done int;
begin
  select * into v_pkg from worker_packages where id = p_package;
  if v_pkg.id is null or v_pkg.status in ('paid','cancelled') then return; end if;

  select count(*) into v_done
    from video_earnings where package_id = p_package and earned_at is not null;

  if v_done >= v_pkg.target_count and v_pkg.status = 'open' then
    update worker_packages set status = 'completed', completed_at = now() where id = p_package;
  elsif v_done < v_pkg.target_count and v_pkg.status = 'completed' then
    -- откат (напр. задача върната от done) — пакетът пак е отворен
    update worker_packages set status = 'open', completed_at = null where id = p_package;
  end if;
end $$;

-- Закача ново начисление към отворен пакет, ако има подходящ и още има място.
create or replace function public.bm_attach_package(p_earning bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_e video_earnings; v_pkg bigint;
begin
  select * into v_e from video_earnings where id = p_earning;
  if v_e.id is null or v_e.package_id is not null or v_e.payout_id is not null then return; end if;

  select w.id into v_pkg
    from worker_packages w
   where w.profile_id = v_e.profile_id
     and w.status = 'open'
     and (w.role_key  is null or w.role_key  = v_e.role_key)
     and (w.client_id is null or w.client_id = v_e.client_id)
     and (select count(*) from video_earnings x where x.package_id = w.id) < w.target_count
   order by ((case when w.client_id is not null then 4 else 0 end)
           + (case when w.role_key  is not null then 2 else 0 end)) desc,
            w.created_at
   limit 1;

  if v_pkg is not null then
    update video_earnings set package_id = v_pkg where id = p_earning;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. НАЧИСЛЯВАНЕ ОТ ЗАДАЧИТЕ
-- ---------------------------------------------------------------------------
-- Преизчислява реда за едно (видео, човек, роля) от текущото състояние на
-- задачите. Викa се от тригера при всяка промяна по tasks.
create or replace function public.bm_refresh_earning(p_item text, p_profile uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_total int; v_open int; v_done_at timestamptz;
  v_client text; v_title text; v_row video_earnings; v_id bigint;
begin
  select count(*), count(*) filter (where t.status <> 'done'), max(t.done_at)
    into v_total, v_open, v_done_at
    from tasks t
    join stage_roles sr on sr.stage_key = t.stage_key
    join profiles    p  on p.initials   = t.assignee
   where t.content_item_id = p_item and p.id = p_profile and sr.role_key = p_role;

  select * into v_row from video_earnings
   where content_item_id = p_item and profile_id = p_profile and role_key = p_role;

  -- Вече платено — не се пипа никога.
  if v_row.id is not null and v_row.payout_id is not null then return; end if;

  -- Няма вече задачи по тази роля (човекът е сменен) → редът отпада,
  -- освен ако цената е пипана ръчно (тогава е съзнателно решение на админа).
  if v_total = 0 then
    if v_row.id is not null and not v_row.price_locked then
      delete from video_earnings where id = v_row.id;
      if v_row.package_id is not null then perform bm_refresh_package(v_row.package_id); end if;
    end if;
    return;
  end if;

  select client_id, coalesce(title, '') into v_client, v_title
    from content_items where id = p_item;

  -- Видеото вече не съществува (изтрито е, а задачата е останала). Не създаваме
  -- нов ред за нищо; съществуващият се пази както си е.
  if v_client is null and v_row.id is null then return; end if;

  if v_row.id is null then
    insert into video_earnings (content_item_id, content_title, profile_id, role_key, client_id, price, earned_at)
    values (p_item, v_title, p_profile, p_role, v_client,
            bm_video_price(p_profile, p_role, v_client),
            case when v_open = 0 then coalesce(v_done_at, now()) end)
    returning id into v_id;
    perform bm_attach_package(v_id);
    select * into v_row from video_earnings where id = v_id;
  else
    update video_earnings set
      client_id     = coalesce(v_client, v_row.client_id),
      content_title = case when v_title <> '' then v_title else v_row.content_title end,
      -- цената следва тарифата, докато не бъде заключена ръчно
      price = case when v_row.price_locked then v_row.price
                   else bm_video_price(p_profile, p_role, v_client) end,
      -- дължимо е чак когато ВСИЧКИТЕ му задачи по тази роля са готови
      earned_at = case when v_open = 0 then coalesce(v_row.earned_at, v_done_at, now()) end
    where id = v_row.id;
  end if;

  if v_row.package_id is not null then perform bm_refresh_package(v_row.package_id); end if;
end $$;

create or replace function public.bm_tasks_earning_sync()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_profile uuid; v_role text;
begin
  -- старото състояние (смяна на изпълнител / етап / изтриване)
  if TG_OP in ('UPDATE','DELETE') and OLD.content_item_id is not null and OLD.stage_key is not null then
    select id into v_profile from profiles where initials = OLD.assignee;
    select role_key into v_role from stage_roles where stage_key = OLD.stage_key;
    if v_profile is not null and v_role is not null then
      perform bm_refresh_earning(OLD.content_item_id, v_profile, v_role);
    end if;
  end if;
  -- новото състояние
  if TG_OP <> 'DELETE' and NEW.content_item_id is not null and NEW.stage_key is not null then
    select id into v_profile from profiles where initials = NEW.assignee;
    select role_key into v_role from stage_roles where stage_key = NEW.stage_key;
    if v_profile is not null and v_role is not null then
      perform bm_refresh_earning(NEW.content_item_id, v_profile, v_role);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_bm_earning_sync on tasks;
create trigger trg_bm_earning_sync after insert or update or delete on tasks
  for each row execute function public.bm_tasks_earning_sync();

-- Старото начисляване по етап (0040/0041) се изключва — двете системи не бива
-- да работят едновременно. Таблицата task_pay остава като архив.
drop trigger if exists trg_fill_task_pay     on tasks;
drop trigger if exists trg_fill_task_pay_ins on tasks;
drop trigger if exists trg_fill_task_pay_upd on tasks;

-- ---------------------------------------------------------------------------
-- 7. ПРЕНОС ОТ task_pay — СЪС СВИВАНЕ НА ДУБЛИКАТИТЕ
-- ---------------------------------------------------------------------------
-- 4 реда „Монтаж" за 2 видеа стават 2. Цената на свития ред = max(старите суми),
-- НЕ сборът — иначе човекът получава двойно за една и съща работа.
do $$
declare r record; v_payout uuid;
begin
  if to_regclass('public.task_pay') is null then return; end if;

  -- `orphan` = задачата сочи към видео, което вече не съществува. В реалната
  -- база tasks НЯМА foreign key към content_items, така че такива редове има.
  -- Работата обаче е свършена и парите се дължат — пренасяме ги със заглавие
  -- по подразбиране и стария id в `legacy_item_id`, вместо да ги изгубим.
  create temporary table _bm_collapse on commit drop as
  select t.content_item_id                                   as item_id,
         (ci.id is null)                                     as orphan,
         coalesce(max(ci.title), '')                         as title,
         p.id                                                as profile_id,
         sr.role_key,
         min(t.client_id)                                    as client_id,
         max(tp.amount)                                      as price,
         (count(*) filter (where t.status <> 'done') = 0)    as all_done,
         max(t.done_at)                                      as done_at,
         bool_and(tp.paid)                                   as all_paid,
         max(tp.paid_at)                                     as paid_at
    from task_pay tp
    join tasks       t  on t.id         = tp.task_id
    join profiles    p  on p.initials   = t.assignee
    join stage_roles sr on sr.stage_key = t.stage_key
    left join content_items ci on ci.id = t.content_item_id
   where t.content_item_id is not null
   group by t.content_item_id, ci.id, p.id, sr.role_key;

  -- Живи видеа
  insert into video_earnings (content_item_id, content_title, profile_id, role_key, client_id, price, earned_at)
  select c.item_id, c.title, c.profile_id, c.role_key, c.client_id, c.price,
         case when c.all_done then coalesce(c.done_at, now()) end
    from _bm_collapse c
   where not c.orphan
     and not exists (select 1 from video_earnings ve
                      where ve.content_item_id = c.item_id
                        and ve.profile_id = c.profile_id and ve.role_key = c.role_key);

  -- Изтрити видеа — редът остава, но вече не сочи към content_items
  insert into video_earnings (legacy_item_id, content_title, profile_id, role_key, client_id, price, earned_at)
  select c.item_id, '(изтрито видео ' || c.item_id || ')', c.profile_id, c.role_key, c.client_id, c.price,
         case when c.all_done then coalesce(c.done_at, now()) end
    from _bm_collapse c
   where c.orphan
     and not exists (select 1 from video_earnings ve
                      where ve.legacy_item_id = c.item_id
                        and ve.profile_id = c.profile_id and ve.role_key = c.role_key);

  -- Вече платените се затварят с по едно наследствено плащане на човек, за да
  -- не изскочат като „дължимо" в новия екран.
  for r in
    select c.profile_id, sum(ve.price) as amount, max(c.paid_at) as paid_at
      from _bm_collapse c
      join video_earnings ve
        on coalesce(ve.content_item_id, ve.legacy_item_id) = c.item_id
       and ve.profile_id = c.profile_id
       and ve.role_key   = c.role_key
     where c.all_paid and ve.payout_id is null
     group by c.profile_id
  loop
    insert into payouts (profile_id, amount, method, reference, note, paid_at)
    values (r.profile_id, r.amount, 'legacy', 'task_pay',
            'Пренос от старата система (0046)', coalesce(r.paid_at, now()))
    returning id into v_payout;

    update video_earnings ve set payout_id = v_payout
      from _bm_collapse c
     where coalesce(ve.content_item_id, ve.legacy_item_id) = c.item_id
       and ve.profile_id = c.profile_id
       and ve.role_key   = c.role_key
       and c.all_paid
       and c.profile_id  = r.profile_id
       and ve.payout_id is null;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. РЕДЪТ НА ЧОВЕКА  —  v_worker_owed
-- ---------------------------------------------------------------------------
-- Дължимо = завършени отделни видеа + завършени неплатени пакети.
-- Филтърът за достъп е ВЪТРЕ във view-то: в PG14 view-та се изпълняват с правата
-- на собственика си и RLS на подлежащите таблици не се прилага.
create or replace view v_worker_owed as
select
  p.id       as profile_id,
  p.initials,
  p.name,
  coalesce(so.owed, 0) + coalesce(po.owed, 0) as owed,
  coalesce(so.upcoming, 0)                    as upcoming,
  coalesce(pd.paid_total, 0)                  as paid_total,
  coalesce(so.owed_videos, 0)                 as owed_videos,
  coalesce(po.owed_packages, 0)               as owed_packages
from profiles p
left join lateral (
  select sum(price)  filter (where earned_at is not null and payout_id is null) as owed,
         sum(price)  filter (where earned_at is null     and payout_id is null) as upcoming,
         count(*)    filter (where earned_at is not null and payout_id is null) as owed_videos
    from video_earnings ve
   where ve.profile_id = p.id and ve.package_id is null
) so on true
left join lateral (
  select sum(total_price) as owed, count(*) as owed_packages
    from worker_packages w
   where w.profile_id = p.id and w.status = 'completed' and w.payout_id is null
) po on true
left join lateral (
  select sum(amount) as paid_total
    from payouts o
   where o.profile_id = p.id and o.voided_at is null
) pd on true
where public.is_admin() or p.id = auth.uid();

-- ---------------------------------------------------------------------------
-- 9. RPC ЗА ФРОНТЕНДА
-- ---------------------------------------------------------------------------

-- Смяна на тарифа = нов ред. Заработеното си пази старата цена.
create or replace function public.bm_set_rate(
  p_profile uuid, p_price numeric, p_role text default null, p_client text default null
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint;
begin
  if not public.is_admin() then raise exception 'Само админ може да сменя тарифи'; end if;
  insert into video_rates (profile_id, role_key, client_id, price)
  values (p_profile, p_role, p_client, round(p_price, 2))
  returning id into v_id;

  -- новата тарифа важи веднага за още незаработените, незаключени редове
  update video_earnings ve
     set price = public.bm_video_price(ve.profile_id, ve.role_key, ve.client_id)
   where ve.profile_id = p_profile
     and ve.payout_id is null
     and not ve.price_locked
     and (p_role   is null or ve.role_key  = p_role)
     and (p_client is null or ve.client_id = p_client);
  return v_id;
end $$;

-- Ръчна цена на конкретно видео — заключва се и тарифата вече не я пипа.
create or replace function public.bm_set_video_price(p_earning bigint, p_price numeric)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Само админ може да сменя суми'; end if;
  update video_earnings
     set price = round(p_price, 2), price_locked = true
   where id = p_earning and payout_id is null;
  if not found then raise exception 'Начислението не съществува или вече е платено'; end if;
end $$;

-- Плащане на ИЗБРАНИ видеа и/или пакети → един ред в payouts.
create or replace function public.bm_pay_videos(
  p_profile   uuid,
  p_earnings  bigint[] default '{}',
  p_packages  bigint[] default '{}',
  p_method    text default null,
  p_reference text default null,
  p_note      text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_payout uuid; v_videos numeric; v_packs numeric; v_total numeric;
begin
  if not public.is_admin() then raise exception 'Само админ може да отбелязва плащания'; end if;

  select coalesce(sum(price), 0) into v_videos
    from video_earnings
   where id = any(coalesce(p_earnings, '{}')) and profile_id = p_profile
     and payout_id is null and earned_at is not null and package_id is null;

  select coalesce(sum(total_price), 0) into v_packs
    from worker_packages
   where id = any(coalesce(p_packages, '{}')) and profile_id = p_profile
     and payout_id is null and status = 'completed';

  v_total := v_videos + v_packs;
  if v_total <= 0 then raise exception 'Няма какво да се плати по този избор'; end if;

  insert into payouts (profile_id, amount, method, reference, note, created_by)
  values (p_profile, v_total, p_method, p_reference, p_note, auth.uid())
  returning id into v_payout;

  update video_earnings set payout_id = v_payout
   where id = any(coalesce(p_earnings, '{}')) and profile_id = p_profile
     and payout_id is null and earned_at is not null and package_id is null;

  update worker_packages set payout_id = v_payout, status = 'paid'
   where id = any(coalesce(p_packages, '{}')) and profile_id = p_profile
     and payout_id is null and status = 'completed';

  return v_payout;
end $$;

-- Плащане на всичко дължимо на един човек.
create or replace function public.bm_pay_all(
  p_profile uuid, p_method text default null, p_reference text default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_e bigint[]; v_p bigint[];
begin
  select coalesce(array_agg(id), '{}') into v_e from video_earnings
   where profile_id = p_profile and payout_id is null and earned_at is not null and package_id is null;
  select coalesce(array_agg(id), '{}') into v_p from worker_packages
   where profile_id = p_profile and payout_id is null and status = 'completed';
  return public.bm_pay_videos(p_profile, v_e, v_p, p_method, p_reference, p_note);
end $$;

-- Отмяна: плащането остава в историята като voided, сумите се връщат в дължимо.
create or replace function public.bm_undo_payout(p_payout uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Само админ може да отменя плащания'; end if;
  update payouts set voided_at = now(), voided_by = auth.uid()
   where id = p_payout and voided_at is null;
  if not found then raise exception 'Плащането не съществува или вече е отменено'; end if;

  update video_earnings  set payout_id = null                    where payout_id = p_payout;
  update worker_packages set payout_id = null, status = 'completed' where payout_id = p_payout;
end $$;

-- Пакет: създаване и отказ.
create or replace function public.bm_create_package(
  p_profile uuid, p_target int, p_total numeric,
  p_label text default '', p_role text default null, p_client text default null
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint; r record;
begin
  if not public.is_admin() then raise exception 'Само админ може да създава пакети'; end if;
  insert into worker_packages (profile_id, label, target_count, total_price, role_key, client_id)
  values (p_profile, coalesce(p_label, ''), p_target, round(p_total, 2), p_role, p_client)
  returning id into v_id;

  -- поема вече съществуващите незаплатени начисления на този човек
  for r in
    select id from video_earnings
     where profile_id = p_profile and package_id is null and payout_id is null
       and (p_role   is null or role_key  = p_role)
       and (p_client is null or client_id = p_client)
     order by created_at
     limit p_target
  loop
    perform public.bm_attach_package(r.id);
  end loop;

  perform public.bm_refresh_package(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 10. ДОСТЪП — админ вижда всичко, човекът вижда САМО своето
-- ---------------------------------------------------------------------------
alter table pay_roles       enable row level security;
alter table stage_roles     enable row level security;
alter table video_rates     enable row level security;
alter table video_earnings  enable row level security;
alter table worker_packages enable row level security;
alter table payouts         enable row level security;

-- Ролите и картата етап→роля не са тайна (нужни са за етикетите в UI).
drop policy if exists "pay_roles read" on pay_roles;
create policy "pay_roles read" on pay_roles for select to authenticated using (true);
drop policy if exists "pay_roles write" on pay_roles;
create policy "pay_roles write" on pay_roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "stage_roles read" on stage_roles;
create policy "stage_roles read" on stage_roles for select to authenticated using (true);
drop policy if exists "stage_roles write" on stage_roles;
create policy "stage_roles write" on stage_roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Парите: чете ги админът или самият човек. Пише ги само админът.
drop policy if exists "video_rates read" on video_rates;
create policy "video_rates read" on video_rates for select to authenticated
  using (public.is_admin() or profile_id = auth.uid());
drop policy if exists "video_rates write" on video_rates;
create policy "video_rates write" on video_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "video_earnings read" on video_earnings;
create policy "video_earnings read" on video_earnings for select to authenticated
  using (public.is_admin() or profile_id = auth.uid());
drop policy if exists "video_earnings write" on video_earnings;
create policy "video_earnings write" on video_earnings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "worker_packages read" on worker_packages;
create policy "worker_packages read" on worker_packages for select to authenticated
  using (public.is_admin() or profile_id = auth.uid());
drop policy if exists "worker_packages write" on worker_packages;
create policy "worker_packages write" on worker_packages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "payouts read" on payouts;
create policy "payouts read" on payouts for select to authenticated
  using (public.is_admin() or profile_id = auth.uid());
drop policy if exists "payouts write" on payouts;
create policy "payouts write" on payouts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Живи промени по сумите в екрана Възнаграждения.
do $$
begin
  begin alter publication supabase_realtime add table video_earnings;  exception when others then null; end;
  begin alter publication supabase_realtime add table worker_packages; exception when others then null; end;
  begin alter publication supabase_realtime add table payouts;         exception when others then null; end;
end $$;

grant select on v_worker_owed to authenticated;
