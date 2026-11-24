-- ============================================================================
-- 0066 — ПРОДАЖБИ: етап „На изчакване"
--
-- За сделки, които не са нито активни, нито загубени: чакаме решение от
-- клиента и нищо не се случва. Стоят в последната колона, за да не пълнят
-- активните етапи и да не изкривяват „Активни сделки".
--   * leads.stage приема и 'waiting'
--   * leads.stage_changed_at — откога сделката е в текущия си етап (слага го
--     базата при всяко преместване), за да се вижда „чака от N дни".
-- Само добавя. Идемпотентна.
-- ============================================================================

alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check
  check (stage in ('new', 'meeting', 'proposal', 'won', 'lost', 'waiting'));

alter table leads add column if not exists stage_changed_at timestamptz;

create or replace function public.bm_lead_stage_clock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.stage_changed_at := coalesce(new.stage_changed_at, now());
  elsif new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_bm_lead_stage_clock on leads;
create trigger trg_bm_lead_stage_clock before insert or update on leads
  for each row execute function public.bm_lead_stage_clock();
