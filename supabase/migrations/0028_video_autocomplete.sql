-- ============================================================================
-- Авто-приключване на видеа: щом насрочената дата мине, а видеото още не е
-- маркирано публикувано, нощният job го премества в „Приключени“
-- (published + published_at + current_stage='publish') и известява
-- изпълнителя на етап „Публикуване“ (fallback „Преглед“) да провери дали
-- наистина е излязло. Нотификацията пристига на живо (realtime).
-- ============================================================================

do $$
begin
  perform cron.unschedule('bm-video-autocomplete');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'bm-video-autocomplete',
    '25 3 * * *',
    $job$
      with due as (
        update content_items
           set published = true,
               published_at = now(),
               current_stage = 'publish'
         where coalesce(published, false) = false
           and date is not null
           and date < current_date
         returning id, title, stages
      )
      insert into notifications (id, recipient, actor_name, actor_initials, body, link, entity_type, entity_id, read)
      select 'n-' || extract(epoch from clock_timestamp())::bigint || '-' || substr(md5(random()::text), 1, 6),
             x.assignee, 'Система', 'BM',
             'Видео „' || coalesce(d.title, '') || '“ мина насрочената си дата и е преместено в „Приключени“ — провери дали е публикувано.',
             '', 'content', d.id, false
        from due d
        cross join lateral (
          select s->>'assignee' as assignee
            from jsonb_array_elements(coalesce(d.stages, '[]'::jsonb)) s
           where s->>'key' in ('publish', 'review')
             and coalesce(s->>'assignee', '') <> ''
           order by case when s->>'key' = 'publish' then 0 else 1 end
           limit 1
        ) x
    $job$
  );
exception when others then
  raise notice 'cron schedule failed: %', sqlerrm;
end $$;
