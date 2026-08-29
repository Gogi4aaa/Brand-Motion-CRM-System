-- ============================================================================
-- 0053 — МЕСЕЧНА СМЕТКА
--
-- Плащането не е след всяко видео, а веднъж месечно. Затова:
--   • срокът на видеото си остава срок ЗА КАЧВАНЕ (решава премията)
--   • плащането се затваря с една сметка за месеца
--
-- ПАРИТЕ СА ТОЧНИ ИЛИ ГИ НЯМА. Затова функцията връща РЕДОВЕ (всеки с
-- източник и сума), а не готово число, и до нея стои проверка, че сборът им
-- съвпада точно с v_worker_owed.owed. Ако някога се разминат, екранът го казва.
--
-- Какво влиза в сметката:
--   1. Самостоятелно видео — заработено, неплатено, ИЗВЪН пакет
--      сума = цена + премия (само ако е earned/granted)
--   2. Завършен пакет — неплатен
--      сума = пакетна цена + заслужените премии на видеата в него
--
-- Какво НЕ влиза:
--   • видеа в НЕЗАТВОРЕН пакет (плащат се при затваряне — иначе двойно)
--   • незаработени видеа (човекът още не си е свършил частта)
--   • вече платени
--   • премии pending / missed / waived
--
-- Дължимото НЕ се реже по месец: видео от юли, което не е платено, влиза и в
-- августовската сметка. Иначе просто изчезва от очите ти и остава неплатено.
-- Месецът служи само да раздели „ново“ от „пренесено“.
--
-- Идемпотентна.
-- ============================================================================

drop function if exists public.bm_month_settlement(text);

create function public.bm_month_settlement(p_month text default null)
returns table (
  profile_id   uuid,
  initials     text,
  worker_name  text,
  kind         text,          -- 'video' | 'package'
  ref_id       bigint,
  title        text,
  client_name  text,
  role_label   text,
  earned_on    date,
  carried_over boolean,       -- заработено ПРЕДИ избрания месец
  price        numeric(12,2),
  bonus        numeric(12,2),
  amount       numeric(12,2)
)
language sql stable security definer set search_path = public
as $$
  with m as (
    select case when p_month is null then null
                else to_date(p_month || '-01', 'YYYY-MM-DD') end as month_start
  )
  -- 1. Самостоятелни видеа (извън пакет)
  select
    e.profile_id, p.initials, p.name,
    'video'::text                                     as kind,
    e.id                                              as ref_id,
    coalesce(nullif(ci.title, ''), nullif(e.content_title, ''), '(видео)') as title,
    c.name                                            as client_name,
    coalesce(r.label, e.role_key)                     as role_label,
    e.earned_at::date                                 as earned_on,
    (select month_start from m) is not null
      and e.earned_at::date < (select month_start from m)  as carried_over,
    e.price::numeric(12,2),
    (case when e.bonus_status in ('earned','granted') then e.bonus_amount else 0 end)::numeric(12,2) as bonus,
    (e.price + case when e.bonus_status in ('earned','granted') then e.bonus_amount else 0 end)::numeric(12,2) as amount
  from video_earnings e
  join profiles p on p.id = e.profile_id
  left join content_items ci on ci.id = e.content_item_id
  left join clients c        on c.id  = e.client_id
  left join pay_roles r      on r.key = e.role_key
  where e.earned_at is not null
    and e.payout_id is null
    and e.package_id is null
    and (public.is_admin() or e.profile_id = auth.uid())

  union all

  -- 2. Завършени неплатени пакети
  select
    w.profile_id, p.initials, p.name,
    'package'::text                                   as kind,
    w.id                                              as ref_id,
    coalesce(nullif(w.label, ''), w.target_count || ' видеа') as title,
    c.name                                            as client_name,
    coalesce(r.label, w.role_key)                     as role_label,
    w.completed_at::date                              as earned_on,
    (select month_start from m) is not null
      and w.completed_at::date < (select month_start from m)  as carried_over,
    w.total_price::numeric(12,2),
    coalesce((select sum(e2.bonus_amount) from video_earnings e2
               where e2.package_id = w.id and e2.bonus_status in ('earned','granted')), 0)::numeric(12,2) as bonus,
    (w.total_price + coalesce((select sum(e2.bonus_amount) from video_earnings e2
               where e2.package_id = w.id and e2.bonus_status in ('earned','granted')), 0))::numeric(12,2) as amount
  from worker_packages w
  join profiles p on p.id = w.profile_id
  left join clients c   on c.id  = w.client_id
  left join pay_roles r on r.key = w.role_key
  where w.status = 'completed'
    and w.payout_id is null
    and (public.is_admin() or w.profile_id = auth.uid())

  order by 3, 4 desc, 9 nulls last;
$$;

grant execute on function public.bm_month_settlement(text) to authenticated;

-- ---------------------------------------------------------------------------
-- ПРОВЕРКА: сборът на редовете трябва да е ТОЧНО дължимото
-- ---------------------------------------------------------------------------
-- Не е декорация. Ако някой ден въведем нов вид начисление и забравим да го
-- добавим на едно от двете места, това го хваща, преди да си платил грешно.
drop function if exists public.bm_settlement_check(text);

create function public.bm_settlement_check(p_month text default null)
returns table (profile_id uuid, initials text, from_lines numeric(12,2), from_view numeric(12,2), ok boolean)
language sql stable security definer set search_path = public
as $$
  select w.profile_id, w.initials,
         coalesce(s.total, 0)::numeric(12,2) as from_lines,
         w.owed::numeric(12,2)               as from_view,
         coalesce(s.total, 0)::numeric(12,2) = w.owed::numeric(12,2) as ok
  from v_worker_owed w
  left join (
    select profile_id, sum(amount) as total
      from public.bm_month_settlement(p_month) group by profile_id
  ) s on s.profile_id = w.profile_id
  where w.owed <> 0 or coalesce(s.total, 0) <> 0;
$$;

grant execute on function public.bm_settlement_check(text) to authenticated;

do $$ begin raise notice '0053: месечната сметка е налична.'; end $$;
