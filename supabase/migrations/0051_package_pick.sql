-- ============================================================================
-- 0051 — ВИДЕАТА В ПАКЕТА СЕ ИЗБИРАТ, НЕ СЕ ПОГЛЪЩАТ
--
-- Проблемът: bm_create_package взимаше ПЪРВИТЕ N съвпадащи начисления по
-- created_at, а тригерът добавяше и всяко следващо, докато пакетът се напълни.
-- Админът нямаше избор и виждаше в пакета видеа, които не е слагал там.
--
-- След тази миграция:
--   • при създаване се подава СПИСЪК с избрани начисления
--   • видео се добавя и маха от пакет по всяко време (докато не е платен)
--   • автоматичното поглъщане е ИЗКЛЮЧЕНО по подразбиране (`auto_fill`)
--
-- Идемпотентна.
-- ============================================================================

alter table worker_packages add column if not exists auto_fill boolean not null default false;
comment on column worker_packages.auto_fill is
  'true = нови съвпадащи видеа влизат сами, докато пакетът се напълни. По подразбиране false — админът ги избира.';

-- ---------------------------------------------------------------------------
-- 1. Автоматичното закачане важи само при auto_fill
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
     and w.auto_fill                                   -- ← само ако е поискано
     and (w.role_key  is null or w.role_key  = v_e.role_key)
     and (w.client_id is null or w.client_id = v_e.client_id)
     and (select count(*) from video_earnings x where x.package_id = w.id) < w.target_count
   order by ((case when w.client_id is not null then 4 else 0 end)
           + (case when w.role_key  is not null then 2 else 0 end)) desc, w.created_at
   limit 1;

  if v_pkg.id is null then return; end if;
  perform public.bm_put_in_package(p_earning, v_pkg.id);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Слагане на конкретно видео в конкретен пакет
-- ---------------------------------------------------------------------------
-- Вътрешна: не проверява админ, защото я викат и тригерът, и RPC-то отгоре.
create or replace function public.bm_put_in_package(p_earning bigint, p_package bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_e video_earnings; v_pkg worker_packages; v_in int;
begin
  select * into v_e   from video_earnings where id = p_earning;
  select * into v_pkg from worker_packages where id = p_package;
  if v_e.id is null or v_pkg.id is null then raise exception 'Начислението или пакетът не съществува'; end if;
  if v_e.payout_id is not null then raise exception 'Видеото вече е платено'; end if;
  if v_pkg.payout_id is not null or v_pkg.status = 'paid' then raise exception 'Пакетът вече е платен'; end if;
  if v_e.profile_id <> v_pkg.profile_id then raise exception 'Видеото е на друг човек'; end if;

  select count(*) into v_in from video_earnings where package_id = p_package and id <> p_earning;
  if v_in >= v_pkg.target_count then
    raise exception 'Пакетът е пълен (% от %)', v_in, v_pkg.target_count;
  end if;

  update video_earnings set
    package_id   = p_package,
    price        = case when price_locked then price
                        else round(v_pkg.total_price / nullif(v_pkg.target_count, 0), 2) end,
    bonus_amount = case when bonus_amount > 0 then bonus_amount else v_pkg.bonus_per_video end,
    bonus_status = case when bonus_status not in ('none') then bonus_status
                        when v_pkg.bonus_per_video > 0 then 'pending' else 'none' end
  where id = p_earning;

  perform public.bm_refresh_package(p_package);
end $$;

create or replace function public.bm_add_to_package(p_earning bigint, p_package bigint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Само админ подрежда пакети'; end if;
  perform public.bm_put_in_package(p_earning, p_package);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Махане от пакет — цената се връща към тарифата
-- ---------------------------------------------------------------------------
create or replace function public.bm_remove_from_package(p_earning bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_e video_earnings; v_pkg bigint;
begin
  if not public.is_admin() then raise exception 'Само админ подрежда пакети'; end if;
  select * into v_e from video_earnings where id = p_earning;
  if v_e.id is null then raise exception 'Начислението не съществува'; end if;
  if v_e.payout_id is not null then raise exception 'Видеото е платено — не се мести'; end if;
  if v_e.package_id is null then return; end if;
  v_pkg := v_e.package_id;

  update video_earnings set
    package_id = null,
    -- ръчната цена си остава; иначе се връща стандартната тарифа
    price = case when price_locked then price
                 else bm_video_price(v_e.profile_id, v_e.role_key, v_e.client_id) end
  where id = p_earning;

  perform public.bm_refresh_package(v_pkg);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Създаване с ИЗБРАНИ видеа
-- ---------------------------------------------------------------------------
-- `p_earnings` = точно тези начисления влизат. NULL/празен масив = празен пакет,
-- който после се пълни на ръка (или сам, ако auto_fill е включен).
drop function if exists public.bm_create_package(uuid, integer, numeric, text, text, text, numeric, numeric, text);

create or replace function public.bm_create_package(
  p_profile uuid, p_target int, p_total numeric,
  p_label text default '', p_role text default null, p_client text default null,
  p_base numeric default null, p_bonus numeric default 0, p_mode text default 'on_completion',
  p_earnings bigint[] default '{}', p_auto boolean default false
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint; r record; v_n int;
begin
  if not public.is_admin() then raise exception 'Само админ може да създава пакети'; end if;
  if p_target < 1 then raise exception 'Броят видеа трябва да е поне 1'; end if;

  v_n := coalesce(array_length(p_earnings, 1), 0);
  if v_n > p_target then
    raise exception 'Избрани са % видеа, а пакетът е за %', v_n, p_target;
  end if;

  if exists (select 1 from worker_packages w
              where w.profile_id = p_profile and w.status = 'open'
                and w.role_key is not distinct from p_role
                and w.client_id is not distinct from p_client) then
    raise exception 'Вече има активен пакет за този човек, клиент и роля.';
  end if;

  insert into worker_packages (profile_id, label, target_count, total_price, role_key, client_id,
                               base_price, bonus_per_video, payout_mode, auto_fill)
  values (p_profile, coalesce(p_label, ''), p_target, round(p_total, 2), p_role, p_client,
          p_base, round(coalesce(p_bonus, 0), 2), p_mode, coalesce(p_auto, false))
  returning id into v_id;

  for r in
    select e.id from video_earnings e
     where e.id = any(p_earnings) and e.profile_id = p_profile
       and e.package_id is null and e.payout_id is null
     order by e.created_at
  loop
    perform public.bm_put_in_package(r.id, v_id);
  end loop;

  perform public.bm_refresh_package(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4b. Изгледът трябва да носи и auto_fill, за да го вижда екранът
-- ---------------------------------------------------------------------------
drop view if exists v_package_progress;
create view v_package_progress as
select
  w.id, w.profile_id, p.initials, p.name as worker_name, w.label,
  w.client_id, c.name as client_name, w.role_key, w.status, w.payout_mode, w.auto_fill,
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
  (current_date - w.started_on)                      as days_running,
  coalesce(x.in_package, 0)                          as in_package
from worker_packages w
join profiles p on p.id = w.profile_id
left join clients c on c.id = w.client_id
left join lateral (
  select count(*)                                                              as in_package,
         count(*) filter (where e.earned_at is not null)                       as used,
         count(*) filter (where e.bonus_status in ('earned','granted'))        as on_time,
         count(*) filter (where e.bonus_status = 'missed')                     as late,
         sum(e.bonus_amount) filter (where e.bonus_status in ('earned','granted')) as bonus_earned,
         sum(e.bonus_amount) filter (where e.bonus_status = 'pending')         as bonus_at_risk,
         sum(e.bonus_amount) filter (where e.bonus_status = 'missed')          as bonus_missed,
         sum(e.bonus_amount) filter (where e.bonus_status in ('earned','granted','pending')) as bonus_max
    from video_earnings e where e.package_id = w.id
) x on true
where public.is_admin() or w.profile_id = auth.uid();

grant select on v_package_progress to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Изчистване на вече погълнатите
-- ---------------------------------------------------------------------------
-- Съществуващите пакети са напълнени автоматично. Не ги пипаме — админът вече
-- може да маха видеа на ръка. Само изключваме поглъщането занапред.
update worker_packages set auto_fill = false where auto_fill;

do $$ begin raise notice '0051: видеата в пакет вече се избират ръчно.'; end $$;
