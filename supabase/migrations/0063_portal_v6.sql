-- ============================================================================
-- 0063 — КЛИЕНТСКИ ПАНЕЛ v6: видеата по месеци и истински падежи
--
-- Досега панелът показваше „последно създадения" цикъл (можеше да е отпреди
-- месеци), броеше само публикуваните, включваше и постовете, показваше
-- черновите фактури като „Чака плащане" и падежа като свободен текст.
--
--   * cycle  — цикълът на ТЕКУЩИЯ месец; готово = видео с дата на предаване
--   * months — всички месеци досега с видеата във всеки (етап, дата на предаване)
--   * invoices — без чернови; с due_date / paid_at / period
--   * since / videos_per_month / platforms / today — за „Клиент от" и пакета
-- Само презаписва функцията portal_get; данни не се пипат. Останалото в нея
-- (items, busy, bookings, review) е непроменено.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_get(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'client_name', cl.name,
    'monthly_fee', coalesce(cl.mrr, 0),
    'paid_total', coalesce((select sum(i.amount) from invoices i where i.client_id = p.client_id and i.status = 'paid'), 0),
    'pending_total', coalesce((select sum(i.amount) from invoices i where i.client_id = p.client_id and i.status in ('pending','overdue')), 0),
    'first_paid_at', (select min(coalesce(i.paid_at, i.created_at::date)) from invoices i where i.client_id = p.client_id and i.status = 'paid'),
    'since', coalesce(cl.contract_start, cl.created_at::date),
    'videos_per_month', cl.videos_per_month,
    'platforms', to_jsonb(coalesce(cl.platforms, '{}'::text[])),
    'today', (now() at time zone 'Europe/Sofia')::date,
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'amount', i.amount, 'status', i.status,
        'issued', i.issued, 'due', i.due, 'due_date', i.due_date, 'paid_at', i.paid_at, 'period', i.period
      ) order by i.issued desc)
      -- черновите са вътрешни — клиентът не ги вижда
      from (select * from invoices where client_id = p.client_id and status <> 'draft' order by issued desc limit 12) i
    ), '[]'::jsonb),
    -- Текущият месец на пакета (не „последно създаденият" цикъл). Готово =
    -- видео с дата на предаване; постовете не влизат в бройката.
    'cycle', (
      select jsonb_build_object(
        'month', cy.month,
        'target_count', cy.target_count,
        'done_count', (select count(*) from content_items ci where ci.cycle_id = cy.id and ci.type <> 'post' and ci.delivered_at is not null),
        'in_work', (select count(*) from content_items ci where ci.cycle_id = cy.id and ci.type <> 'post' and ci.delivered_at is null),
        'phase', cy.phase
      )
      from content_cycles cy
      where cy.client_id = p.client_id
        and cy.month <= to_char((now() at time zone 'Europe/Sofia')::date, 'YYYY-MM')
      order by cy.month desc
      limit 1
    ),
    -- Всички месеци досега (най-новият първи) с видеата във всеки.
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', cy.month,
        'target_count', cy.target_count,
        'videos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ci.id, 'title', ci.title,
            'current_stage', coalesce(ci.current_stage, 'strategy'),
            'delivered_at', ci.delivered_at,
            'date', ci.date,
            'published', coalesce(ci.published, false)
          ) order by ci.delivered_at nulls first, ci.created_at)
          from content_items ci
          where ci.cycle_id = cy.id and ci.type <> 'post'
        ), '[]'::jsonb)
      ) order by cy.month desc)
      from (
        select * from content_cycles
         where client_id = p.client_id
           and month <= to_char((now() at time zone 'Europe/Sofia')::date, 'YYYY-MM')
         order by month desc limit 12
      ) cy
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',            c.id,
        'title',         c.title,
        'type',          c.type,
        'date',          c.date,
        'published',     coalesce(c.published, false),
        'current_stage', coalesce(c.current_stage, 'strategy'),
        'stages',        coalesce((
          select jsonb_agg(jsonb_build_object('key', s->>'key', 'status', s->>'status'))
          from jsonb_array_elements(coalesce(c.stages, '[]'::jsonb)) s
        ), '[]'::jsonb),
        'metrics', (
          select jsonb_build_object(
            'platform', m.platform, 'url', m.url, 'views', m.views,
            'likes', m.likes, 'comments', m.comments, 'shares', m.shares,
            'updated_at', m.updated_at
          )
          from video_metrics m where m.content_item_id = c.id
        ),
        -- Само изпратените към клиента видеа носят линк и решение.
        'review', case when c.client_review_status <> '' then jsonb_build_object(
          'status',     c.client_review_status,
          'url',        c.client_review_url,
          'feedback',   c.client_review_feedback,
          'sent_at',    c.client_review_sent_at,
          'decided_at', c.client_review_decided_at
        ) end
      ) order by coalesce(c.published, false), c.date desc nulls last, c.created_at desc)
      from content_items c
      where c.client_id = p.client_id
    ), '[]'::jsonb),
    -- Заетите слотове на ВСИЧКИ клиенти (одобрени), само дата+час, без имена.
    'busy', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', b.date, 'start', to_char(b.start_time, 'HH24:MI'), 'end', to_char(b.end_time, 'HH24:MI')
      ) order by b.date, b.start_time)
      from shoot_bookings b
      where b.status = 'approved' and b.date >= current_date
    ), '[]'::jsonb),
    -- Собствените заявки на този клиент (със статус).
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'date', b.date, 'start', to_char(b.start_time, 'HH24:MI'),
        'end', to_char(b.end_time, 'HH24:MI'), 'status', b.status
      ) order by b.date, b.start_time)
      from shoot_bookings b
      where b.client_id = p.client_id and b.date >= current_date
    ), '[]'::jsonb)
  )
  from client_portals p
  join clients cl on cl.id = p.client_id
  where p.token = p_token and p.active;
$function$;
