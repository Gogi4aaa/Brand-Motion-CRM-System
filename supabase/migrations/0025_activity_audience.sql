-- ============================================================================
-- Активността спира да изтича: записите получават audience ('team'|'admin').
-- Мениджъри/сътрудници виждат само 'team' (продукция, задачи, съдържание);
-- клиенти, фактури, плащания и сделки са 'admin' — филтрирано с RLS на ниво
-- база (is_admin() от 0020), не само в интерфейса.
-- ============================================================================

alter table activity add column if not exists audience text not null default 'team'
  check (audience in ('team','admin'));

-- Заварените чувствителни записи стават admin-only.
update activity set audience = 'admin'
where action like 'добави клиент%'
   or action like 'обнови клиент%'
   or action like 'изтри клиент%'
   or action like 'създаде фактура%'
   or action like 'обнови фактура%'
   or action like 'изтри фактура%'
   or action like 'отбеляза % като платена'
   or action like 'отбеляза плащане%'
   or action like 'спечели сделка%'
   or action like 'включи клиент%'
   or action like 'стартира кампания%'
   or action like 'създаде рекламна чернова%'
   or action like 'публикува реклама%';

drop policy if exists "auth all" on activity;
drop policy if exists "activity read" on activity;
drop policy if exists "activity write" on activity;
create policy "activity read" on activity for select to authenticated
  using (audience = 'team' or public.is_admin());
create policy "activity write" on activity for insert to authenticated
  with check (true);
