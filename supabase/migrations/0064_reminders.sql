-- ============================================================================
-- 0064 — НАПОМНЯНИЯ: дневник на напомнянията за плащане + седмичен отчет
--
--   * reminder_log — кое напомняне за коя фактура вече е пратено (за да не се
--     праща два пъти и да се вижда кога последно е напомняно). Само админ.
--   * bm_weekly_digest() + pg_cron — всеки понеделник сутрин в Telegram (през
--     съществуващия бот, bm_bot_call): просрочените фактури, клиентите, които
--     изостават с пакета за месеца, и видеата, които искат внимание.
--     Ако няма нищо за казване — не праща нищо.
-- Само добавя. Към клиенти не се изпраща нищо. Идемпотентна.
-- ============================================================================

create table if not exists reminder_log (
  id         bigserial primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  stage      text not null check (stage in ('before', 'due', 'after', 'second', 'call')),
  channel    text not null default 'manual',      -- manual | email
  sent_by    text not null default '',
  sent_at    timestamptz not null default now(),
  unique (invoice_id, stage)
);
alter table reminder_log enable row level security;
drop policy if exists "reminder log admin" on reminder_log;
create policy "reminder log admin" on reminder_log for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.bm_weekly_digest(p_send boolean default true)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
       where cy.month = v_month and cy.target_count > 0 and c.archived_at is null and c.status <> 'Churned'
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
   where not coalesce(ci.published, false) and ci.type <> 'post' and c.archived_at is null and c.status <> 'Churned';
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
end $$;
revoke all on function public.bm_weekly_digest(boolean) from public, anon;
grant execute on function public.bm_weekly_digest(boolean) to authenticated;

do $$
begin
  perform cron.unschedule('bm-weekly-digest');
exception when others then null;
end $$;
do $$
begin
  -- понеделник 06:40 UTC — след сутрешния чек (06:30)
  perform cron.schedule('bm-weekly-digest', '40 6 * * 1', $job$ select public.bm_weekly_digest(true) $job$);
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;
