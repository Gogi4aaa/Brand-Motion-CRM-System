-- ============================================================================
-- 0059 — МЕСЕЧЕН ПАКЕТ НА КЛИЕНТА: вярна бройка видеа по месеци
--
-- Досега бройката идваше от твърди пакети в кода (8/16/24, с постове вътре),
-- не се пазеше в клиента, нов месец не се отваряше сам, а ръчно добавените
-- видеа не влизаха в никой месец (95 от 124 бяха без месец).
--
--   * clients.videos_per_month — договорената бройка (8 / 10 / 12). Оттук се
--     отваря цикълът за всеки месец. Празно = още не е зададена.
--   * leads.videos_per_month / monthly_fee — попълват се в сделката и се
--     пренасят в клиента, когато сделката стане клиент (и от CRM-а, и от
--     Telegram бота — тригерът е на leads.client_id, не в bm_pipeline_won).
--   * content_cycles — най-много един цикъл на клиент за месец.
--   * content_items.cycle_id — ВСЯКО видео е към месец-пакет. Ако не е подаден,
--     базата го слага сама: месецът на датата му, иначе текущият месец.
--   * content_items.delivered_at — кога видеото реално е станало готово
--     (стигнало е „Публикуване" или е публикувано). Връщане за доработка го
--     изчиства. Месецът на пакета и датата на предаване са РАЗЛИЧНИ неща:
--     видео за октомври, предадено на 5 ноември, се брои за октомври, но личи,
--     че е закъсняло.
--   * bm_open_month_cycles() + pg_cron — отваря цикъла на новия месец.
--   * спира bm-video-autocomplete (0028): то маркираше „публикувано" всяко
--     видео с минала дата, на който и етап да е — това изкривяваше бройките.
--     Истинското публикуване минава през publish_queue.
--
-- Допълнителни колони за следващите стъпки (падежи и напомняния):
--   clients.payment_terms_days, billing_email, contract_start.
-- Идемпотентна.
-- ============================================================================

-- ---- 1. Колони --------------------------------------------------------------
alter table clients add column if not exists videos_per_month integer
  check (videos_per_month is null or videos_per_month between 1 and 200);
alter table clients add column if not exists payment_terms_days integer not null default 7
  check (payment_terms_days between 0 and 120);
alter table clients add column if not exists billing_email text not null default '';
alter table clients add column if not exists contract_start date;
update clients set contract_start = created_at::date where contract_start is null;

alter table leads add column if not exists videos_per_month integer
  check (videos_per_month is null or videos_per_month between 1 and 200);
alter table leads add column if not exists monthly_fee numeric(12,2)
  check (monthly_fee is null or monthly_fee >= 0);

alter table content_items add column if not exists delivered_at timestamptz;

-- ---- 2. Един цикъл на клиент за месец ---------------------------------------
create unique index if not exists content_cycles_client_month_uq on content_cycles (client_id, month);
alter table content_cycles drop constraint if exists content_cycles_month_check;
alter table content_cycles add constraint content_cycles_month_check
  check (month ~ '^\d{4}-(0[1-9]|1[0-2])$');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_items_cycle_fk') then
    alter table content_items add constraint content_items_cycle_fk
      foreign key (cycle_id) references content_cycles(id) on delete set null;
  end if;
end $$;
create index if not exists content_items_cycle_idx on content_items (cycle_id);

-- ---- 3. Цикълът за (клиент, месец) — намира го или го отваря ----------------
create or replace function public.bm_cycle_for(p_client text, p_month text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_now text := to_char((now() at time zone 'Europe/Sofia')::date, 'YYYY-MM');
begin
  select id into v_id from content_cycles where client_id = p_client and month = p_month;
  if v_id is not null then return v_id; end if;
  insert into content_cycles (id, client_id, month, target_count, phase, created_at)
  select 'cy-' || p_month || '-' || c.id, c.id, p_month, coalesce(c.videos_per_month, 0),
         case when p_month < v_now then 'published' when p_month = v_now then 'production' else 'ideas' end,
         -- минал месец се подрежда като минал, не като „току-що създаден"
         least(now(), to_date(p_month || '-01', 'YYYY-MM-DD')::timestamptz + interval '12 hours')
    from clients c where c.id = p_client
  on conflict (client_id, month) do nothing;
  select id into v_id from content_cycles where client_id = p_client and month = p_month;
  return v_id;
end $$;
revoke all on function public.bm_cycle_for(text, text) from public, anon;
grant execute on function public.bm_cycle_for(text, text) to authenticated;

-- Ново видео без месец → месецът на датата му, иначе текущият. Постовете не
-- се броят в пакета, затова не ги закачаме автоматично.
create or replace function public.bm_content_assign_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.cycle_id is null and coalesce(new.type, '') <> 'post' and new.client_id is not null then
      new.cycle_id := public.bm_cycle_for(
        new.client_id,
        to_char(coalesce(new.date, (now() at time zone 'Europe/Sofia')::date), 'YYYY-MM'));
    end if;
  exception when others then
    raise warning 'bm_content_assign_cycle failed: %', sqlerrm;  -- никога не блокира CRM-а
  end;
  return new;
end $$;
drop trigger if exists trg_bm_content_assign_cycle on content_items;
create trigger trg_bm_content_assign_cycle before insert on content_items
  for each row execute function public.bm_content_assign_cycle();

-- ---- 4. Дата на предаване ----------------------------------------------------
-- Наследените: публикуваните — по датата на публикуване (но не в бъдещето:
-- насрочените през опашката имат бъдещ published_at); чакащите в „Публикуване"
-- — по последното приемане на труда по видеото, иначе сега.
update content_items ci
   set delivered_at = least(coalesce(ci.published_at, now()), now())
 where coalesce(ci.published, false) and ci.delivered_at is null;
update content_items ci
   set delivered_at = coalesce(
         (select max(coalesce(ve.accepted_at, ve.earned_at)) from video_earnings ve where ve.content_item_id = ci.id),
         now())
 where ci.current_stage = 'publish' and not coalesce(ci.published, false) and ci.delivered_at is null;

create or replace function public.bm_content_delivered()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.current_stage = 'publish' or coalesce(new.published, false) then
    if new.delivered_at is null then new.delivered_at := now(); end if;
  else
    new.delivered_at := null;  -- върнато за доработка → пак не е предадено
  end if;
  return new;
end $$;
drop trigger if exists trg_bm_content_delivered on content_items;
create trigger trg_bm_content_delivered before insert or update on content_items
  for each row execute function public.bm_content_delivered();

-- ---- 5. Наследените видеа без месец → месецът на датата им ------------------
update content_items ci
   set cycle_id = public.bm_cycle_for(
         ci.client_id,
         to_char(coalesce(ci.date, (ci.published_at at time zone 'Europe/Sofia')::date, ci.created_at::date), 'YYYY-MM'))
 where ci.cycle_id is null and coalesce(ci.type, '') <> 'post' and ci.client_id is not null;

-- ---- 6. Бройката на клиента → цикълът на текущия месец ----------------------
create or replace function public.bm_client_quota_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char((now() at time zone 'Europe/Sofia')::date, 'YYYY-MM');
begin
  if new.videos_per_month is null or new.archived_at is not null or new.status = 'Churned' then return new; end if;
  if tg_op = 'UPDATE' and new.videos_per_month is not distinct from old.videos_per_month then return new; end if;
  insert into content_cycles (id, client_id, month, target_count, phase)
  values ('cy-' || v_month || '-' || new.id, new.id, v_month, new.videos_per_month, 'ideas')
  on conflict (client_id, month) do update set target_count = excluded.target_count;
  return new;
end $$;
drop trigger if exists trg_bm_client_quota_sync on clients;
create trigger trg_bm_client_quota_sync after insert or update of videos_per_month on clients
  for each row execute function public.bm_client_quota_sync();

-- ---- 7. Сделка стана клиент → бройката и таксата идват от сделката ----------
create or replace function public.bm_lead_to_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null and new.client_id is distinct from old.client_id then
    update clients c
       set videos_per_month = coalesce(c.videos_per_month, new.videos_per_month),
           mrr = case when coalesce(c.mrr, 0) = 0 and coalesce(new.monthly_fee, 0) > 0
                      then round(new.monthly_fee)::integer else c.mrr end
     where c.id = new.client_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_bm_lead_to_client on leads;
create trigger trg_bm_lead_to_client after update of client_id on leads
  for each row execute function public.bm_lead_to_client();

-- ---- 8. Бройката на месеца я пипат само админ/мениджър ----------------------
-- content_cycles остава отворена за четене и за смяна на фазата (импортът на
-- сценарии я мести), но целта е договорена с клиента — не е за всеки.
create or replace function public.bm_cycle_target_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.target_count is distinct from old.target_count
     and auth.uid() is not null
     and public.bm_my_role() not in ('admin', 'manager') then
    raise exception 'Само админ или мениджър може да променя месечната бройка.';
  end if;
  return new;
end $$;
drop trigger if exists trg_bm_cycle_target_guard on content_cycles;
create trigger trg_bm_cycle_target_guard before update on content_cycles
  for each row execute function public.bm_cycle_target_guard();

-- ---- 9. Отваряне на новия месец ---------------------------------------------
create or replace function public.bm_open_month_cycles(p_month text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
   where c.videos_per_month is not null and c.archived_at is null and c.status <> 'Churned'
  on conflict (client_id, month) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.bm_open_month_cycles(text) from public, anon;
grant execute on function public.bm_open_month_cycles(text) to authenticated;

select public.bm_open_month_cycles();

do $$
begin
  perform cron.unschedule('bm-open-month-cycles');
exception when others then null;
end $$;
do $$
begin
  -- всеки ден (не само на 1-во): безвредно е и наваксва, ако някой ден е пропуснат
  perform cron.schedule('bm-open-month-cycles', '10 0 * * *', $job$ select public.bm_open_month_cycles() $job$);
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;

-- ---- 10. Край на „публикувано по дата" --------------------------------------
do $$
begin
  perform cron.unschedule('bm-video-autocomplete');
exception when others then null;
end $$;
