-- ============================================================================
-- 0050 — СРОКОВЕ, ПРЕМИИ ЗА НАВРЕМЕ И ПАКЕТНИ РЕЖИМИ
--
-- Надгражда 0046. Единицата остава (видео × човек × роля); тук се добавя:
--   • срок на видеото (от календара, ръчно или „подаване + N дни")
--   • премия за навреме със собствен жизнен цикъл
--   • по-богат пакет: базова цена, премия на видео, режим на плащане
--   • изгледите, от които екранът чете, без да пресмята нищо сам
--
-- ПРАВИЛО, ЗАШИТО ТУК: дължимото НИКОГА не се смята на две места.
--   едно видео → v_earning_full.payable
--   един човек → v_worker_owed.owed
--   целият екип → сборът на редовете
--
-- Идемпотентна.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. НАЧИСЛЕНИЯТА: срок, часовник, премия
-- ---------------------------------------------------------------------------
alter table video_earnings add column if not exists due_at        date;
alter table video_earnings add column if not exists due_source    text;
alter table video_earnings add column if not exists started_at    timestamptz;
alter table video_earnings add column if not exists submitted_at  timestamptz;
alter table video_earnings add column if not exists accepted_at   timestamptz;
alter table video_earnings add column if not exists redos         int not null default 0;
alter table video_earnings add column if not exists bonus_amount  numeric(12,2) not null default 0;
alter table video_earnings add column if not exists bonus_status  text not null default 'none';
alter table video_earnings add column if not exists note          text;

do $$ begin
  alter table video_earnings drop constraint if exists video_earnings_due_source_chk;
  alter table video_earnings add constraint video_earnings_due_source_chk
    check (due_source is null or due_source in ('manual','calendar','handover'));
  alter table video_earnings drop constraint if exists video_earnings_bonus_status_chk;
  alter table video_earnings add constraint video_earnings_bonus_status_chk
    check (bonus_status in ('none','pending','earned','missed','granted','waived'));
end $$;

create index if not exists video_earnings_due_idx on video_earnings (due_at) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- 2. ПАКЕТИТЕ: базова цена, премия на видео, режим
-- ---------------------------------------------------------------------------
-- `base_price` = колко би струвало видеото БЕЗ пакета. От него излиза
-- „Спестено" — числото, което казва дали договорката ти върши работа.
alter table worker_packages add column if not exists payout_mode     text not null default 'on_completion';
alter table worker_packages add column if not exists base_price      numeric(12,2);
alter table worker_packages add column if not exists bonus_per_video numeric(12,2) not null default 0;
alter table worker_packages add column if not exists started_on      date not null default current_date;
alter table worker_packages add column if not exists note            text;

do $$ begin
  alter table worker_packages drop constraint if exists worker_packages_payout_mode_chk;
  alter table worker_packages add constraint worker_packages_payout_mode_chk
    check (payout_mode in ('on_completion','monthly_partial'));
end $$;

-- ---------------------------------------------------------------------------
-- 3. СРОКЪТ — откъде идва
-- ---------------------------------------------------------------------------
-- Приоритет: ръчно зададен → ден преди публикуване (календар) → подаване + 3 дни.
-- Видео без дата в календара и без ръчен срок НЯМА срок и следователно няма
-- премия. Това не е грешка, а съзнателно състояние.
create or replace function public.bm_resolve_due(p_earning bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v video_earnings; v_date date;
begin
  select * into v from video_earnings where id = p_earning;
  if v.id is null or v.due_source = 'manual' then return; end if;

  select ci.date into v_date from content_items ci where ci.id = v.content_item_id;

  -- Вече решена премия не мърда — иначе местенето на публикуването отнема
  -- премия със задна дата.
  if v.bonus_status in ('earned','missed','granted','waived') then return; end if;

  if v_date is not null then
    update video_earnings set due_at = v_date - 1, due_source = 'calendar' where id = p_earning;
  elsif v.submitted_at is not null then
    update video_earnings set due_at = (v.submitted_at::date + 3), due_source = 'handover' where id = p_earning;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. ИЗГЛЕДИ
-- ---------------------------------------------------------------------------

-- Изгледите се пресъздават, а не се заменят: `create or replace view` отказва
-- да смени типа на колона (owed става numeric(12,2)). Редът е по зависимост.
drop view if exists v_deadlines;
drop view if exists v_worker_owed;
drop view if exists v_package_progress;
drop view if exists v_earning_full;

-- 4.1 Едно начисление, обогатено. `payable` е ЕДИНСТВЕНАТА истина за реда.
create or replace view v_earning_full as
select
  e.id, e.content_item_id, e.legacy_item_id,
  coalesce(ci.title, e.content_title, '(видео)')            as title,
  ci.date                                                    as publish_on,
  e.profile_id, p.initials, p.name as worker_name,
  e.role_key, coalesce(r.label, e.role_key)                  as role_label,
  e.client_id, c.name                                        as client_name,
  e.price, e.price_locked, e.package_id, e.payout_id,
  e.due_at, e.due_source, e.started_at, e.submitted_at, e.accepted_at, e.redos,
  e.bonus_amount, e.bonus_status, e.earned_at, e.created_at, e.note,
  -- статус, съвместим със спецификацията
  case
    when e.payout_id is not null                      then 'paid'
    when e.package_id is not null                     then 'in_package'
    when e.earned_at is not null                      then 'owed'
    else 'pending'
  end                                                        as status,
  -- ПЛАТИМО: платените и тези в незатворен пакет дават 0
  case
    when e.payout_id is not null or e.package_id is not null then 0
    when e.earned_at is not null
      then e.price + case when e.bonus_status in ('earned','granted') then e.bonus_amount else 0 end
    else 0
  end::numeric(12,2)                                         as payable,
  case when e.bonus_status = 'pending' then e.bonus_amount else 0 end::numeric(12,2) as bonus_at_risk,
  -- отрицателно = подадено по-рано от срока
  case when e.due_at is null then null
       when e.submitted_at is not null then (e.submitted_at::date - e.due_at)
       else (current_date - e.due_at) end                     as days_late,
  case
    when e.accepted_at  is not null then 'прието'
    when e.submitted_at is not null then 'чака преглед'
    when e.due_at is null           then 'без срок'
    when e.due_at <  current_date   then 'просрочено'
    when e.due_at <= current_date + 2 then 'изтича'
    else 'в срок'
  end                                                        as timeline
from video_earnings e
join profiles p on p.id = e.profile_id
left join content_items ci on ci.id = e.content_item_id
left join clients c        on c.id = e.client_id
left join pay_roles r      on r.key = e.role_key
where public.is_admin() or e.profile_id = auth.uid();

-- 4.2 Пакетът с прогреса си
create or replace view v_package_progress as
select
  w.id, w.profile_id, p.initials, p.name as worker_name, w.label,
  w.client_id, c.name as client_name, w.role_key, w.status, w.payout_mode,
  w.target_count                                     as videos_total,
  w.total_price                                      as price_total,
  w.base_price, w.bonus_per_video, w.started_on, w.completed_at, w.payout_id,
  round(w.total_price / nullif(w.target_count, 0), 2) as price_per_video,
  coalesce(x.used, 0)                                as used,
  coalesce(x.on_time, 0)                             as on_time,
  coalesce(x.late, 0)                                as late,
  coalesce(x.bonus_earned, 0)                        as bonus_earned,
  coalesce(x.bonus_at_risk, 0)                       as bonus_at_risk,
  coalesce(x.bonus_missed, 0)                        as bonus_missed,
  (w.total_price + coalesce(x.bonus_earned, 0))::numeric(12,2)  as payable_now,
  (w.total_price + coalesce(x.bonus_max, 0))::numeric(12,2)     as payable_max,
  case when w.base_price is null then null
       else (w.base_price * w.target_count - (w.total_price + coalesce(x.bonus_earned, 0)))::numeric(12,2)
  end                                                as saved_vs_base,
  (current_date - w.started_on)                      as days_running
from worker_packages w
join profiles p on p.id = w.profile_id
left join clients c on c.id = w.client_id
left join lateral (
  select count(*) filter (where e.earned_at is not null)                      as used,
         count(*) filter (where e.bonus_status in ('earned','granted'))       as on_time,
         count(*) filter (where e.bonus_status = 'missed')                    as late,
         sum(e.bonus_amount) filter (where e.bonus_status in ('earned','granted')) as bonus_earned,
         sum(e.bonus_amount) filter (where e.bonus_status = 'pending')        as bonus_at_risk,
         sum(e.bonus_amount) filter (where e.bonus_status = 'missed')         as bonus_missed,
         sum(e.bonus_amount) filter (where e.bonus_status in ('earned','granted','pending')) as bonus_max
    from video_earnings e where e.package_id = w.id
) x on true
where public.is_admin() or w.profile_id = auth.uid();

-- 4.3 Броячите за филтрите
create or replace view v_deadlines as
select profile_id, timeline, count(*) as n, sum(bonus_at_risk) as bonus_at_risk
from v_earning_full
where status <> 'paid'
group by profile_id, timeline;

-- 4.4 Редът на човека — ЕДИНСТВЕНИЯТ източник за „дължимо"
create or replace view v_worker_owed as
select
  p.id as profile_id, p.initials, p.name,
  (coalesce(v.owed_videos_sum, 0) + coalesce(k.pkg_owed, 0))::numeric(12,2) as owed,
  coalesce(v.owed_videos_sum, 0)::numeric(12,2)   as owed_videos,
  coalesce(k.pkg_owed, 0)::numeric(12,2)          as owed_packages,
  coalesce(v.pending, 0)::numeric(12,2)           as pending,
  coalesce(v.upcoming, 0)::numeric(12,2)          as upcoming,
  coalesce(pd.paid_total, 0)::numeric(12,2)       as paid_total,
  coalesce(v.bonus_earned_total, 0)::numeric(12,2) as bonus_earned_total,
  coalesce(v.bonus_at_risk, 0)::numeric(12,2)     as bonus_at_risk,
  coalesce(v.videos_done, 0)                      as videos_done,
  coalesce(v.late_videos, 0)                      as late_videos,
  coalesce(v.owed_count, 0)                       as owed_count
from profiles p
left join lateral (
  select
    sum(price + case when bonus_status in ('earned','granted') then bonus_amount else 0 end)
      filter (where earned_at is not null and payout_id is null and package_id is null) as owed_videos_sum,
    count(*) filter (where earned_at is not null and payout_id is null and package_id is null) as owed_count,
    sum(price) filter (where earned_at is null and package_id is null)                  as pending,
    sum(price) filter (where earned_at is null and package_id is null)                  as upcoming,
    sum(bonus_amount) filter (where bonus_status in ('earned','granted'))               as bonus_earned_total,
    sum(bonus_amount) filter (where bonus_status = 'pending')                           as bonus_at_risk,
    count(*) filter (where earned_at is not null)                                       as videos_done,
    count(*) filter (where bonus_status = 'missed')                                     as late_videos
  from video_earnings e where e.profile_id = p.id
) v on true
left join lateral (
  select sum(w.total_price + coalesce((
           select sum(e2.bonus_amount) from video_earnings e2
            where e2.package_id = w.id and e2.bonus_status in ('earned','granted')), 0)) as pkg_owed
    from worker_packages w
   where w.profile_id = p.id and w.status = 'completed' and w.payout_id is null
) k on true
left join lateral (
  select sum(amount) as paid_total from payouts o
   where o.profile_id = p.id and o.voided_at is null
) pd on true
where public.is_admin() or p.id = auth.uid();

grant select on v_earning_full, v_package_progress, v_deadlines, v_worker_owed to authenticated;

-- ---------------------------------------------------------------------------
-- 5. ДЕЙСТВИЯ
-- ---------------------------------------------------------------------------

-- 5.1 Работникът казва „готово". Часовникът спира ТУК — колкото и да се бави
-- прегледът, премията му вече е решена по този момент.
create or replace function public.bm_submit_video(p_earning bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v video_earnings;
begin
  select * into v from video_earnings where id = p_earning;
  if v.id is null then raise exception 'Начислението не съществува'; end if;
  if not (public.is_admin() or v.profile_id = auth.uid()) then
    raise exception 'Можеш да маркираш само своите видеа';
  end if;
  if v.accepted_at is not null then raise exception 'Видеото вече е прието'; end if;

  update video_earnings set submitted_at = now() where id = p_earning;
  perform public.bm_resolve_due(p_earning);
end $$;

-- 5.2 Админът приема. Тук се решава премията — по подаване спрямо срока.
create or replace function public.bm_accept_video(p_earning bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v video_earnings; v_ontime boolean; v_new text;
begin
  if not public.is_admin() then raise exception 'Само админ приема видеа'; end if;
  select * into v from video_earnings where id = p_earning;
  if v.id is null then raise exception 'Начислението не съществува'; end if;

  -- Ръчно даденото/отнетото не се пренаписва.
  if v.bonus_status in ('granted','waived') then
    v_new := v.bonus_status;
  elsif v.bonus_amount = 0 or v.due_at is null then
    v_new := 'none';
  else
    v_ontime := coalesce(v.submitted_at::date, current_date) <= v.due_at;
    v_new := case when v_ontime then 'earned' else 'missed' end;
  end if;

  update video_earnings set
    accepted_at  = coalesce(accepted_at, now()),
    submitted_at = coalesce(submitted_at, now()),
    earned_at    = coalesce(earned_at, now()),
    bonus_status = v_new
  where id = p_earning;

  if v.package_id is not null then perform public.bm_refresh_package(v.package_id); end if;
end $$;

-- 5.3 Връщане за преправка: часовникът тръгва пак.
create or replace function public.bm_return_video(p_earning bigint, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v video_earnings;
begin
  if not public.is_admin() then raise exception 'Само админ връща видеа'; end if;
  select * into v from video_earnings where id = p_earning;
  if v.id is null then raise exception 'Начислението не съществува'; end if;

  update video_earnings set
    submitted_at = null, accepted_at = null, earned_at = null,
    redos = redos + 1,
    bonus_status = case when bonus_status in ('granted','waived') then bonus_status
                        when bonus_amount > 0 then 'pending' else 'none' end,
    note = coalesce(p_reason, note)
  where id = p_earning;

  if v.package_id is not null then perform public.bm_refresh_package(v.package_id); end if;
end $$;

-- 5.4 Премията на ръка. Причината е задължителна — след три месеца ще искаш
-- да знаеш защо си я дал.
create or replace function public.bm_grant_bonus(p_earning bigint, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Само админ'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Причината е задължителна'; end if;
  update video_earnings set bonus_status = 'granted',
         note = coalesce(note || ' · ', '') || 'премия: ' || p_reason
   where id = p_earning and payout_id is null;
  if not found then raise exception 'Начислението не съществува или е платено'; end if;
end $$;

create or replace function public.bm_waive_bonus(p_earning bigint, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Само админ'; end if;
  update video_earnings set bonus_status = 'waived',
         note = coalesce(note || ' · ', '') || 'без премия' || coalesce(': ' || p_reason, '')
   where id = p_earning and payout_id is null;
  if not found then raise exception 'Начислението не съществува или е платено'; end if;
end $$;

-- 5.5 Ръчен срок и ръчна премия
create or replace function public.bm_set_due(p_earning bigint, p_due date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Само админ'; end if;
  update video_earnings set due_at = p_due, due_source = 'manual' where id = p_earning;
  if not found then raise exception 'Начислението не съществува'; end if;
end $$;

create or replace function public.bm_set_bonus(p_earning bigint, p_amount numeric)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Само админ'; end if;
  update video_earnings set
    bonus_amount = round(coalesce(p_amount, 0), 2),
    bonus_status = case when coalesce(p_amount,0) = 0 then 'none'
                        when bonus_status in ('none') then 'pending'
                        else bonus_status end
   where id = p_earning and payout_id is null;
  if not found then raise exception 'Начислението не съществува или е платено'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. ПЛАЩАНЕТО ВЕЧЕ ВКЛЮЧВА ПРЕМИИТЕ
-- ---------------------------------------------------------------------------
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

  select coalesce(sum(price + case when bonus_status in ('earned','granted') then bonus_amount else 0 end), 0)
    into v_videos from video_earnings
   where id = any(coalesce(p_earnings, '{}')) and profile_id = p_profile
     and payout_id is null and earned_at is not null and package_id is null;

  select coalesce(sum(w.total_price + coalesce((
           select sum(e.bonus_amount) from video_earnings e
            where e.package_id = w.id and e.bonus_status in ('earned','granted')), 0)), 0)
    into v_packs from worker_packages w
   where w.id = any(coalesce(p_packages, '{}')) and w.profile_id = p_profile
     and w.payout_id is null and w.status = 'completed';

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

-- ---------------------------------------------------------------------------
-- 7. НАЧИСЛЯВАНЕТО ПЪЛНИ СРОК И ПРЕМИЯ
-- ---------------------------------------------------------------------------
create or replace function public.bm_attach_package(p_earning bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_e video_earnings; v_pkg worker_packages;
begin
  select * into v_e from video_earnings where id = p_earning;
  if v_e.id is null or v_e.package_id is not null or v_e.payout_id is not null then return; end if;

  select * into v_pkg
    from worker_packages w
   where w.profile_id = v_e.profile_id
     and w.status = 'open'
     and (w.role_key  is null or w.role_key  = v_e.role_key)
     and (w.client_id is null or w.client_id = v_e.client_id)
     and (select count(*) from video_earnings x where x.package_id = w.id) < w.target_count
   order by ((case when w.client_id is not null then 4 else 0 end)
           + (case when w.role_key  is not null then 2 else 0 end)) desc, w.created_at
   limit 1;

  if v_pkg.id is null then return; end if;

  -- Пакетната цена и премия важат за видеата в него.
  update video_earnings set
    package_id   = v_pkg.id,
    price        = case when price_locked then price
                        else round(v_pkg.total_price / nullif(v_pkg.target_count, 0), 2) end,
    bonus_amount = case when bonus_amount > 0 then bonus_amount else v_pkg.bonus_per_video end,
    bonus_status = case when bonus_status <> 'none' then bonus_status
                        when v_pkg.bonus_per_video > 0 then 'pending' else 'none' end
  where id = p_earning;
end $$;

-- Тригерът вече решава и срока.
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

  if v_row.id is not null and v_row.payout_id is not null then return; end if;

  if v_total = 0 then
    if v_row.id is not null and not v_row.price_locked then
      delete from video_earnings where id = v_row.id;
      if v_row.package_id is not null then perform bm_refresh_package(v_row.package_id); end if;
    end if;
    return;
  end if;

  select client_id, coalesce(title, '') into v_client, v_title
    from content_items where id = p_item;
  if v_client is null and v_row.id is null then return; end if;

  if v_row.id is null then
    insert into video_earnings (content_item_id, content_title, profile_id, role_key, client_id, price, earned_at, started_at)
    values (p_item, v_title, p_profile, p_role, v_client,
            bm_video_price(p_profile, p_role, v_client),
            case when v_open = 0 then coalesce(v_done_at, now()) end,
            now())
    returning id into v_id;
    perform bm_attach_package(v_id);
    perform bm_resolve_due(v_id);
    select * into v_row from video_earnings where id = v_id;
  else
    update video_earnings set
      client_id     = coalesce(v_client, v_row.client_id),
      content_title = case when v_title <> '' then v_title else v_row.content_title end,
      price = case when v_row.price_locked then v_row.price
                   when v_row.package_id is not null then v_row.price
                   else bm_video_price(p_profile, p_role, v_client) end,
      earned_at = case when v_open = 0 then coalesce(v_row.earned_at, v_done_at, now()) end
    where id = v_row.id;
    perform bm_resolve_due(v_row.id);
  end if;

  if v_row.package_id is not null then perform bm_refresh_package(v_row.package_id); end if;
end $$;

-- Пакетът се затваря по БРОЙ ПРИЕТИ видеа.
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
    update worker_packages set status = 'open', completed_at = null where id = p_package;
  end if;
end $$;

-- Старата 6-аргументна версия от 0046 се маха: две претоварвания правят
-- извикването двусмислено за PostgREST.
drop function if exists public.bm_create_package(uuid, integer, numeric, text, text, text);

-- Създаване на пакет — вече с базова цена, премия и режим.
create or replace function public.bm_create_package(
  p_profile uuid, p_target int, p_total numeric,
  p_label text default '', p_role text default null, p_client text default null,
  p_base numeric default null, p_bonus numeric default 0, p_mode text default 'on_completion'
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint; r record;
begin
  if not public.is_admin() then raise exception 'Само админ може да създава пакети'; end if;
  if exists (select 1 from worker_packages w
              where w.profile_id = p_profile and w.status = 'open'
                and w.role_key is not distinct from p_role
                and w.client_id is not distinct from p_client) then
    raise exception 'Вече има активен пакет за този човек, клиент и роля — второто видео пак ще влезе в него.';
  end if;

  insert into worker_packages (profile_id, label, target_count, total_price, role_key, client_id,
                               base_price, bonus_per_video, payout_mode)
  values (p_profile, coalesce(p_label, ''), p_target, round(p_total, 2), p_role, p_client,
          p_base, round(coalesce(p_bonus, 0), 2), p_mode)
  returning id into v_id;

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
-- 8. Проверка
-- ---------------------------------------------------------------------------
do $$ begin
  perform 1 from v_earning_full limit 1;
  perform 1 from v_package_progress limit 1;
  perform 1 from v_worker_owed limit 1;
  raise notice '0050: срокове, премии и пакетни режими са налични.';
end $$;
