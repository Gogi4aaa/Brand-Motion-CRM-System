-- ============================================================================
-- Архив и автоматично чистене:
--   * content_items.published_at — кога видеото реално е публикувано; бордът
--     в „Продукция“ скрива публикуваното след 7 дни (UI филтър, данните
--     остават за клиентския портал и брояча на пакета).
--   * tasks.done_at — кога таскът е завършен; Done колоната в „Задачи“ скрива
--     по-старите от 7 дни.
--   * pg_cron job: веднъж дневно ИЗТРИВА безстойностните авто-таскове
--     (създадени от production моста, без възнаграждение и без отчетено
--     време) 30+ дни след завършването им. Таскове с пари/време не се трият
--     никога — те са историята на плащанията.
-- ============================================================================

alter table content_items add column if not exists published_at timestamptz;
update content_items
  set published_at = coalesce(date::timestamptz, created_at)
  where published and published_at is null;

alter table tasks add column if not exists done_at timestamptz;
update tasks
  set done_at = coalesce(paid_at, created_at)
  where status = 'done' and done_at is null;

-- pg_cron може да липсва на някои планове — миграцията не бива да гърми.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable: %', sqlerrm;
end $$;

do $$
begin
  perform cron.unschedule('bm-junk-task-cleanup');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'bm-junk-task-cleanup',
    '17 3 * * *',
    $job$
      delete from tasks
      where content_item_id is not null
        and status = 'done'
        and coalesce(pay_amount, 0) = 0
        and coalesce(time_logged, 0) = 0
        and coalesce(done_at, created_at) < now() - interval '30 days'
    $job$
  );
exception when others then
  raise notice 'cron schedule failed: %', sqlerrm;
end $$;
