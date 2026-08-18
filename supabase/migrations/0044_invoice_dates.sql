-- 0044: реални дати на фактурите.
-- Досега `issued` беше свободен текст и приложението пишеше буквалното "Today",
-- а месечните сметки караха по created_at (кога е ВЪВЕДЕН редът). Юлска фактура,
-- въведена през август, влизаше в август. Сега:
--   issued  = кога е издадена фактурата (реална дата, за фактуриране/падежи)
--   paid_at = кога е платена (по нея се смята реално събраното по месеци)

-- 1) Нормализирай наследените стойности ("Today", "", свободен текст) → деня на реда.
update invoices set issued = created_at::date::text
  where issued !~ '^\d{4}-\d{2}-\d{2}$';
-- Старият текстов default ('') не се кастира към date — маха се преди смяната на типа.
alter table invoices alter column issued drop default;
alter table invoices alter column issued type date using issued::date;
alter table invoices alter column issued set default current_date;

-- 2) Дата на плащане. За вече платените приемаме деня на въвеждане — по-точна
--    информация просто не съществува в базата.
alter table invoices add column if not exists paid_at date;
update invoices set paid_at = created_at::date where status = 'paid' and paid_at is null;

-- ---- portal_get v4: first_paid_at по paid_at, фактурите подредени по issued ----
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
    'first_paid_at', (select min(coalesce(i.paid_at, i.created_at::date)) from invoices i where i.client_id = p.client_id and i.status = 'paid'),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'amount', i.amount, 'status', i.status,
        'issued', i.issued, 'due', i.due
      ) order by i.issued desc)
      from (select * from invoices where client_id = p.client_id order by issued desc limit 12) i
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
$$;
revoke all on function portal_get(text) from public;
grant execute on function portal_get(text) to anon, authenticated;
