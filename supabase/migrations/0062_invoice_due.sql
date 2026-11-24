-- ============================================================================
-- 0062 — ПАДЕЖ КАТО ДАТА: кой закъснява с плащането и с колко
--
-- Досега падежът беше свободен текст („15 юли", „—") — нито една от 19-те
-- фактури нямаше четима дата, „просрочена" се слагаше на ръка и закъснението
-- не можеше да се измери.
--
--   * invoices.due_date — истинска дата. Ако не е подадена, базата я смята:
--     датата на издаване + срока за плащане на клиента (clients.payment_terms_days).
--   * invoices.payment_method — как е платено (по желание).
--   * bm_mark_overdue() + pg_cron — всяка сутрин „Чака плащане" с минал падеж
--     става „Просрочена". Нищо друго не се пипа.
-- Старото текстово поле due остава, но вече не се ползва за сметки.
-- Идемпотентна.
-- ============================================================================

alter table invoices add column if not exists due_date date;
alter table invoices add column if not exists payment_method text not null default '';

update invoices i
   set due_date = i.issued + coalesce((select c.payment_terms_days from clients c where c.id = i.client_id), 7)
 where i.due_date is null and i.issued is not null;
create index if not exists invoices_due_idx on invoices (status, due_date);

create or replace function public.bm_invoice_due()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.due_date is null and new.issued is not null then
    new.due_date := new.issued + coalesce((select c.payment_terms_days from clients c where c.id = new.client_id), 7);
  end if;
  return new;
end $$;
drop trigger if exists trg_bm_invoice_due on invoices;
create trigger trg_bm_invoice_due before insert or update on invoices
  for each row execute function public.bm_invoice_due();

create or replace function public.bm_mark_overdue()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  update invoices set status = 'overdue'
   where status = 'pending' and due_date is not null
     and due_date < (now() at time zone 'Europe/Sofia')::date;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.bm_mark_overdue() from public, anon;
grant execute on function public.bm_mark_overdue() to authenticated;

select public.bm_mark_overdue();

do $$
begin
  perform cron.unschedule('bm-mark-overdue');
exception when others then null;
end $$;
do $$
begin
  -- 05:50 UTC — преди напомнянето за събиране (06:15) и сутрешния чек (06:30)
  perform cron.schedule('bm-mark-overdue', '50 5 * * *', $job$ select public.bm_mark_overdue() $job$);
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;
