-- ============================================================================
-- 0061 — ИСТОРИЯ НА ЕТАПИТЕ: кое видео къде е, откога и защо стои там
--
-- Досега не се пазеше кога видеото е сменило етап — нямаше как да се каже
-- „стои в Монтаж от 9 дни" или „чака клиента от 5 дни".
--
--   * content_items.stage_entered_at — откога е в текущия етап (слага го базата)
--   * content_items.waiting_on / waiting_note / waiting_since — ЗАЩО стои:
--     чака клиента / материал / снимачен ден / човек от екипа / друго.
--     Причината се изчиства сама, щом видеото смени етапа.
--   * content_stage_events — всяко преместване: от кой етап, в кой, кой го е
--     направил, кога и колко дни е стояло в предишния.
--
-- Историята се пише от базата (тригер), не от браузъра — хваща и местенията
-- от Telegram бота и автоматичното публикуване. Само добавя. Идемпотентна.
-- ============================================================================

alter table content_items add column if not exists stage_entered_at timestamptz;
alter table content_items add column if not exists waiting_on text not null default ''
  check (waiting_on in ('', 'client', 'footage', 'shoot', 'team', 'other'));
alter table content_items add column if not exists waiting_note text not null default '';
alter table content_items add column if not exists waiting_since timestamptz;

create table if not exists content_stage_events (
  id              bigserial primary key,
  content_item_id text not null references content_items(id) on delete cascade,
  from_stage      text,                       -- празно = видеото е създадено
  to_stage        text not null,
  changed_by      text not null default '',   -- инициали; 'система' = бот/автоматика
  changed_at      timestamptz not null default now(),
  days_in_prev    numeric(8,2)                -- колко дни е стояло в from_stage
);
create index if not exists content_stage_events_item_idx on content_stage_events (content_item_id, changed_at);

alter table content_stage_events enable row level security;
drop policy if exists "stage events read" on content_stage_events;
create policy "stage events read" on content_stage_events for select to authenticated
  using (
    public.is_admin() or public.bm_my_role() = 'manager'
    or exists (select 1 from content_items ci
                where ci.id = content_stage_events.content_item_id
                  and ci.client_id = any (public.bm_my_clients()))
  );
-- писане: само тригерът (security definer) — няма политика за insert/update/delete

-- ---- Наследените: най-добрата налична оценка -------------------------------
-- Готовите — от датата на предаване; останалите — от последното движение по
-- труда/прегледа/корекциите, иначе от създаването. За старите видеа това е
-- приближение; оттук нататък се записва точно.
update content_items ci
   set stage_entered_at = least(now(), coalesce(
         case when ci.current_stage = 'publish' or coalesce(ci.published, false) then ci.delivered_at end,
         greatest(
           (select max(greatest(ve.started_at, ve.submitted_at, ve.accepted_at))
              from video_earnings ve where ve.content_item_id = ci.id),
           ci.client_review_sent_at, ci.client_review_decided_at, ci.corrections_at),
         ci.created_at, now()))
 where ci.stage_entered_at is null;

-- ---- Тригери ----------------------------------------------------------------
create or replace function public.bm_content_stage_clock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.stage_entered_at := coalesce(new.stage_entered_at, now());
    if new.waiting_on <> '' and new.waiting_since is null then new.waiting_since := now(); end if;
    return new;
  end if;
  if new.current_stage is distinct from old.current_stage then
    new.stage_entered_at := now();
    new.waiting_on := ''; new.waiting_note := ''; new.waiting_since := null;  -- причината важи за етапа
  elsif new.waiting_on is distinct from old.waiting_on then
    new.waiting_since := case when new.waiting_on = '' then null else now() end;
    if new.waiting_on = '' then new.waiting_note := ''; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_bm_content_stage_clock on content_items;
create trigger trg_bm_content_stage_clock before insert or update on content_items
  for each row execute function public.bm_content_stage_clock();

create or replace function public.bm_content_stage_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by text := coalesce(nullif(public.bm_my_initials(), ''), 'система');
begin
  begin
    if tg_op = 'INSERT' then
      insert into content_stage_events (content_item_id, from_stage, to_stage, changed_by)
      values (new.id, null, coalesce(new.current_stage, 'strategy'), v_by);
    elsif new.current_stage is distinct from old.current_stage then
      insert into content_stage_events (content_item_id, from_stage, to_stage, changed_by, days_in_prev)
      values (new.id, old.current_stage, new.current_stage, v_by,
              round((extract(epoch from (now() - coalesce(old.stage_entered_at, now()))) / 86400)::numeric, 2));
    end if;
  exception when others then
    raise warning 'bm_content_stage_log failed: %', sqlerrm;  -- никога не блокира CRM-а
  end;
  return new;
end $$;
drop trigger if exists trg_bm_content_stage_log on content_items;
create trigger trg_bm_content_stage_log after insert or update on content_items
  for each row execute function public.bm_content_stage_log();
