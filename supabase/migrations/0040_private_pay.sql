-- ============================================================================
-- Приватни възнаграждения. Досега pay_amount/paid стояха като колони на `tasks`
-- (политика „auth all") → всеки логнат можеше да ги чете. Местим ги в отделни
-- таблици с row-level security, така че сумите се виждат САМО от админа и
-- конкретния работник. Ставката е по човек (worker_rates, дефолт €15) и се
-- попълва автоматично при създаване на стъпка-задача (тригер).
-- ============================================================================

-- ---- Ставка по работник (само админ пише; работникът вижда своята) ----------
create table if not exists worker_rates (
  profile_id uuid primary key references profiles(id) on delete cascade,
  rate       numeric not null default 15
);
alter table worker_rates enable row level security;
drop policy if exists "rates read" on worker_rates;
create policy "rates read" on worker_rates for select to authenticated
  using (public.is_admin() or profile_id = auth.uid());
drop policy if exists "rates write" on worker_rates;
create policy "rates write" on worker_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- Заплащане per задача (приватно: админ ИЛИ изпълнителят на задачата) ------
create table if not exists task_pay (
  task_id text primary key references tasks(id) on delete cascade,
  amount  numeric not null default 0,
  paid    boolean not null default false,
  paid_at timestamptz
);
alter table task_pay enable row level security;
drop policy if exists "task_pay read" on task_pay;
create policy "task_pay read" on task_pay for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from tasks t join profiles p on p.initials = t.assignee
      where t.id = task_pay.task_id and p.id = auth.uid()
    )
  );
drop policy if exists "task_pay write" on task_pay;
create policy "task_pay write" on task_pay for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- Пренос на съществуващите суми от tasks -> task_pay -----------------------
insert into task_pay (task_id, amount, paid, paid_at)
  select id, coalesce(pay_amount, 0), coalesce(paid, false), paid_at from tasks
  on conflict (task_id) do nothing;

-- ---- Авто-попълване на сумата при нова стъпка-задача --------------------------
-- SECURITY DEFINER: чете worker_rates независимо кой създава задачата (напр.
-- работник, който придвижва видео). Ставка по инициали → или €15 по подразбиране.
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
    on conflict (task_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fill_task_pay on tasks;
create trigger trg_fill_task_pay after insert on tasks
  for each row execute function public.fill_task_pay();

-- ---- Realtime за живи промени по заплащането ----------------------------------
alter publication supabase_realtime add table task_pay;

-- ---- Махаме течащите колони от tasks (done_at остава — не е чувствителен) ------
alter table tasks drop column if exists pay_amount;
alter table tasks drop column if exists paid;
alter table tasks drop column if exists paid_at;
