-- ============================================================================
-- 0058 — СЪБИРАНЕ ПО МЕСЕЦИ: кой колко е платил и колко още дължи
--
-- Досега фактурата нямаше „за кой месец е" — всичко се броеше по дата на
-- плащане, та закъсняло плащане за октомври отиваше в ноември и нямаше как да
-- се види „клиент X е дал 300 от 500 за месеца".
--
--   * invoices.period ('YYYY-MM') — месецът, ЗА който е плащането. Плащане на
--     части = няколко платени реда с един и същ period.
--   * client_month_targets — корекция на очакваното за конкретен месец
--     (по подразбиране се очаква clients.mrr).
--   * bm_month_collections(месец) — очаквано / платено / остава по клиент.
--   * bm_collection_reminder() + pg_cron — известие към админите кой колко
--     дължи (1-во, 10-о, 20-о, 27-о число).
--
-- ПРАВИЛОТО (същото е в lib/data.ts → monthCollections; пипаш ли едното,
-- пипни и другото):
--   очаквано = корекцията за месеца, ако има; иначе mrr, ако клиентът е „жив"
--              през месеца (не е архивиран, не е Churned преди началото му,
--              създаден е преди края му); иначе 0
--   платено  = сбор на paid фактурите с period = месеца
--   остава   = max(0, очаквано − платено)
-- Идемпотентна.
-- ============================================================================

alter table invoices add column if not exists period text;
-- Наследените: приемаме месеца на издаване (поправя се от модала при нужда).
update invoices set period = to_char(coalesce(issued, created_at::date), 'YYYY-MM') where period is null;
alter table invoices drop constraint if exists invoices_period_check;
alter table invoices add constraint invoices_period_check
  check (period is null or period ~ '^\d{4}-(0[1-9]|1[0-2])$');
create index if not exists invoices_period_idx on invoices (period, client_id);

create table if not exists client_month_targets (
  client_id  text not null references clients(id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount     numeric(12,2) not null default 0 check (amount >= 0),
  note       text not null default '',
  updated_at timestamptz not null default now(),
  primary key (client_id, month)
);
alter table client_month_targets enable row level security;
drop policy if exists "month targets admin" on client_month_targets;
create policy "month targets admin" on client_month_targets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- Сметката по клиент за даден месец -------------------------------------
create or replace function public.bm_month_collections(p_month text)
returns table (client_id text, client_name text, expected numeric, paid numeric, remaining numeric, has_override boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_end   date := (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
begin
  -- Логнат потребител трябва да е админ; cron-ът (без auth.uid) минава.
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  select x.id, x.name, x.expected, x.paid, greatest(0, x.expected - x.paid), x.has_override
  from (
    select c.id, c.name,
           coalesce(t.amount,
             case when c.archived_at is null
                   and c.created_at < v_end
                   and (c.status <> 'Churned' or (c.churned_at is not null and c.churned_at >= v_start))
                   and (c.churned_at is null or c.churned_at >= v_start)
                  then coalesce(c.mrr, 0) else 0 end
           )::numeric as expected,
           coalesce((select sum(i.amount) from invoices i
                      where i.client_id = c.id and i.period = p_month and i.status = 'paid'), 0)::numeric as paid,
           (t.client_id is not null) as has_override,
           exists (select 1 from invoices i where i.client_id = c.id and i.period = p_month) as has_inv
    from clients c
    left join client_month_targets t on t.client_id = c.id and t.month = p_month
  ) x
  where x.expected > 0 or x.has_inv
  order by greatest(0, x.expected - x.paid) desc, x.name;
end;
$$;
revoke all on function public.bm_month_collections(text) from public, anon;
grant execute on function public.bm_month_collections(text) to authenticated;

-- ---- Напомняне към админите --------------------------------------------------
-- Едно известие на админ за текущия месец (+ едно за остатъка от предходния).
-- Ако никой не дължи — нищо не праща.
create or replace function public.bm_collection_reminder()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Sofia')::date;
  v_months text[] := array[
    to_char(v_today - interval '1 month', 'YYYY-MM'),
    to_char(v_today, 'YYYY-MM')];
  v_names text[] := array['януари','февруари','март','април','май','юни','юли','август','септември','октомври','ноември','декември'];
  v_m text; v_total numeric; v_cnt int; v_list text; v_body text; v_sent int := 0; v_i int := 0;
  fmt constant text := 'FM999G999G990D00';
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'admin only';
  end if;

  foreach v_m in array v_months loop
    v_i := v_i + 1;
    select coalesce(sum(r.remaining), 0), count(*),
           string_agg(r.client_name || ' €' || rtrim(rtrim(to_char(r.remaining, 'FM999999990.00'), '0'), '.'), ', '
                      order by r.remaining desc)
      into v_total, v_cnt, v_list
      from public.bm_month_collections(v_m) r
     where r.remaining > 0;
    continue when v_cnt = 0;

    v_body := case when v_i = 1 then 'Още несъбрано за ' else 'За ' end
      || v_names[split_part(v_m, '-', 2)::int]
      || case when v_i = 1 then ': €' else ' остават €' end
      || rtrim(rtrim(to_char(v_total, 'FM999999990.00'), '0'), '.')
      || ' от ' || v_cnt || case when v_cnt = 1 then ' клиент: ' else ' клиента: ' end
      || left(v_list, 400);

    insert into notifications (id, recipient, actor_name, actor_initials, body, link, entity_type, entity_id, read)
    select 'n-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text || pr.initials || v_m), 1, 6),
           pr.initials, 'BrandMotion', 'BM', v_body, '/invoices', 'collections', v_m, false
    from profiles pr
    where pr.role = 'admin' and coalesce(pr.initials, '') <> '';
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke all on function public.bm_collection_reminder() from public, anon;
grant execute on function public.bm_collection_reminder() to authenticated;

-- ---- Разписание: 1-во, 10-о, 20-о, 27-о число, 06:15 UTC (~9 ч. българско) ----
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable: %', sqlerrm;
end $$;

do $$
begin
  perform cron.unschedule('bm-collection-reminder');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('bm-collection-reminder', '15 6 1,10,20,27 * *', $job$ select public.bm_collection_reminder() $job$);
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;
