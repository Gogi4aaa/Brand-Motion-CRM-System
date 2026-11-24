-- ============================================================================
-- 0065 — ПРОЕКТНИ КЛИЕНТИ + месецът на видеото се определя при предаване
--
-- 1) clients.engagement: 'retainer' (постоянен, с месечна такса и пакет) или
--    'project' (работим с него от време на време). Проектният клиент остава в
--    системата с цялата си история и може да получава видеа и фактури, но:
--      * от него не се очаква месечна такса (bm_month_collections);
--      * не му се отваря месечен цикъл (bm_open_month_cycles);
--      * не влиза в „изостава" и „видеа, които искат внимание" в седмичния
--        преглед (просрочена фактура обаче пак се показва).
--
-- 2) content_items.cycle_manual: видео, на което месецът НЕ е избран ръчно,
--    получава месеца си в момента, в който стане готово (месецът на предаване).
--    Досега идея без дата се закачаше към месеца, в който е създадена, и щом
--    стане готова след време, щеше да се брои за стар месец. Ръчно избраният
--    месец („Месец на пакета" в прозореца на видеото) не се пипа.
-- Идемпотентна.
-- ============================================================================

alter table clients add column if not exists engagement text not null default 'retainer'
  check (engagement in ('retainer', 'project'));
alter table content_items add column if not exists cycle_manual boolean not null default false;

create or replace function public.bm_content_delivered()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.current_stage = 'publish' or coalesce(new.published, false) then
    if new.delivered_at is null then
      new.delivered_at := now();
      -- готово сега → брои се за текущия месец, освен ако месецът е избран ръчно
      if not new.cycle_manual and coalesce(new.type, '') <> 'post' and new.client_id is not null then
        begin
          new.cycle_id := public.bm_cycle_for(new.client_id, to_char((now() at time zone 'Europe/Sofia')::date, 'YYYY-MM'));
        exception when others then
          raise warning 'bm_content_delivered cycle failed: %', sqlerrm;  -- никога не блокира CRM-а
        end;
      end if;
    end if;
  else
    new.delivered_at := null;  -- върнато за доработка → пак не е предадено
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.bm_month_collections(p_month text)
 RETURNS TABLE(client_id text, client_name text, expected numeric, paid numeric, remaining numeric, has_override boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                   and c.engagement = 'retainer'   -- проектните нямат месечна такса
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
$function$;

CREATE OR REPLACE FUNCTION public.bm_open_month_cycles(p_month text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_month text := coalesce(p_month, to_char((now() at time zone 'Europe/Sofia')::date, 'YYYY-MM'));
  v_n integer;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  -- цикли, отворени автоматично от видео преди да има зададена бройка
  update content_cycles cy set target_count = c.videos_per_month
    from clients c
   where cy.client_id = c.id and cy.month = v_month and cy.target_count = 0 and c.videos_per_month is not null;
  insert into content_cycles (id, client_id, month, target_count, phase)
  select 'cy-' || v_month || '-' || c.id, c.id, v_month, c.videos_per_month, 'ideas'
    from clients c
   where c.videos_per_month is not null and c.archived_at is null and c.status <> 'Churned' and c.engagement = 'retainer'
  on conflict (client_id, month) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.bm_weekly_digest(p_send boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Europe/Sofia')::date;
  v_month text := to_char(v_today, 'YYYY-MM');
  v_dim   int  := extract(day from (date_trunc('month', v_today) + interval '1 month - 1 day'))::int;
  v_out text := '📋 Седмичен преглед — ' || to_char(v_today, 'DD.MM');
  v_lines text; v_n int; v_sum numeric; v_any boolean := false;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;

  -- 1. Просрочени фактури
  select count(*), coalesce(sum(i.amount), 0),
         string_agg('• ' || coalesce(c.name, i.client_id) || ' — €' || trim(to_char(i.amount, 'FM999G999G990D00')) || ' · ' || (v_today - i.due_date) || ' дни', E'\n' order by i.due_date)
    into v_n, v_sum, v_lines
    from invoices i left join clients c on c.id = i.client_id
   where i.status in ('pending', 'overdue') and i.due_date is not null and i.due_date < v_today;
  if v_n > 0 then
    v_any := true;
    v_out := v_out || E'\n\n💶 Просрочени: €' || trim(to_char(v_sum, 'FM999G999G990D00')) || ' (' || v_n || E')\n' || v_lines;
  end if;

  -- 2. Клиенти, които изостават с пакета за месеца (равномерно темпо)
  select count(*), string_agg('• ' || name || ' — ' || done || '/' || target || ' (до днес ~' || expected || ')', E'\n' order by (done::numeric / target))
    into v_n, v_lines
    from (
      select c.name, cy.target_count as target,
             floor(cy.target_count * extract(day from v_today)::numeric / v_dim)::int as expected,
             (select count(*) from content_items ci where ci.cycle_id = cy.id and ci.type <> 'post' and ci.delivered_at is not null)::int as done
        from content_cycles cy join clients c on c.id = cy.client_id
       where cy.month = v_month and cy.target_count > 0 and c.archived_at is null and c.status <> 'Churned' and c.engagement = 'retainer'
    ) x
   where done + 1 < expected;
  if v_n > 0 then
    v_any := true;
    v_out := v_out || E'\n\n🎬 Изостават за месеца (' || v_n || E'):\n' || v_lines;
  end if;

  -- 3. Видеа, които искат внимание
  select count(*) filter (where ci.date is not null and ci.date < v_today),
         count(*) filter (where (ci.date is null or ci.date >= v_today) and ci.waiting_on = '' and ci.current_stage <> 'publish' and ci.stage_entered_at < now() - interval '7 days'),
         count(*) filter (where (ci.date is null or ci.date >= v_today) and ci.waiting_on <> '' and ci.waiting_since < now() - interval '5 days')
    into v_n, v_sum, v_dim
    from content_items ci join clients c on c.id = ci.client_id
   where not coalesce(ci.published, false) and ci.type <> 'post' and c.archived_at is null and c.status <> 'Churned' and c.engagement = 'retainer';
  if v_n + v_sum + v_dim > 0 then
    v_any := true;
    v_out := v_out || E'\n\n⏳ Видеа: ' || concat_ws(' · ',
      case when v_n > 0 then v_n || ' след датата' end,
      case when v_sum > 0 then v_sum || ' стоят над 7 дни в етап' end,
      case when v_dim > 0 then v_dim || ' чакат над 5 дни' end);
  end if;

  if not v_any then return null; end if;  -- нищо за казване → не безпокоим
  if p_send then
    perform public.bm_bot_call(jsonb_build_object('action', 'alert', 'text', v_out));
  end if;
  return v_out;
end $function$;
