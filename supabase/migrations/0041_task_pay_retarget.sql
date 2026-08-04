-- ============================================================================
-- Стъпка-задачите се преизползват и се пренасочват към следващия етап/изпълнител
-- (syncStageTask). При смяна на изпълнителя сумата трябва да стане ставката на
-- НОВИЯ човек — освен ако вече е платена. Затова тригерът вече хваща и UPDATE на
-- assignee. on conflict … where not paid пази вече платените и не ги пипа.
-- ============================================================================

create or replace function public.fill_task_pay()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_rate numeric;
begin
  if new.content_item_id is not null and new.stage_key is not null then
    select wr.rate into v_rate
    from worker_rates wr join profiles p on p.id = wr.profile_id
    where p.initials = new.assignee;
    insert into task_pay (task_id, amount)
    values (new.id, coalesce(v_rate, 15))
    on conflict (task_id) do update
      set amount = excluded.amount
      where task_pay.paid = false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_task_pay on tasks;
drop trigger if exists trg_fill_task_pay_ins on tasks;
drop trigger if exists trg_fill_task_pay_upd on tasks;
create trigger trg_fill_task_pay_ins after insert on tasks
  for each row execute function public.fill_task_pay();
create trigger trg_fill_task_pay_upd after update on tasks
  for each row when (new.assignee is distinct from old.assignee)
  execute function public.fill_task_pay();
