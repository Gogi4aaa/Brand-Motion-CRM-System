-- ============================================================================
-- Клиентският портал v2: освен прогреса на видеата, собственикът вижда
--   * парите по офертата — месечна такса, общо платено, чакащи фактури,
--     списък на фактурите с период;
--   * пакета за месеца (content_cycles.target_count) и колко видеа от него
--     са публикувани — когато бройката е изпълнена, порталът показва
--     напомняне за плащане (с чакащата фактура, ако има такава).
-- Замества portal_get от 0021 (връща разширен payload).
-- ============================================================================

create or replace function portal_get(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'client_name', cl.name,
    'monthly_fee', coalesce(cl.mrr, 0),
    'paid_total', coalesce((select sum(i.amount) from invoices i where i.client_id = p.client_id and i.status = 'paid'), 0),
    'pending_total', coalesce((select sum(i.amount) from invoices i where i.client_id = p.client_id and i.status in ('pending','overdue')), 0),
    'first_paid_at', (select min(i.created_at) from invoices i where i.client_id = p.client_id and i.status = 'paid'),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'amount', i.amount, 'status', i.status,
        'issued', i.issued, 'due', i.due
      ) order by i.created_at desc)
      from (select * from invoices where client_id = p.client_id order by created_at desc limit 12) i
    ), '[]'::jsonb),
    'cycle', (
      select jsonb_build_object(
        'month', cy.month,
        'target_count', cy.target_count,
        'done_count', (
          select count(*) from content_items ci
          where ci.cycle_id = cy.id and coalesce(ci.published, false)
        ),
        'phase', cy.phase
      )
      from content_cycles cy
      where cy.client_id = p.client_id
      order by cy.created_at desc
      limit 1
    ),
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
        )
      ) order by coalesce(c.published, false), c.date desc nulls last, c.created_at desc)
      from content_items c
      where c.client_id = p.client_id
    ), '[]'::jsonb)
  )
  from client_portals p
  join clients cl on cl.id = p.client_id
  where p.token = p_token and p.active;
$$;

revoke all on function portal_get(text) from public;
grant execute on function portal_get(text) to anon, authenticated;
