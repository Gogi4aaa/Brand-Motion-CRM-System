-- ============================================================================
-- 0057 — ПРЕГЛЕД НА ГОТОВОТО ВИДЕО ОТ КЛИЕНТА, ВЪТРЕ В ПОРТАЛА
--
-- Досега готовият вариант се пращаше на клиента по чат и бележките му се губеха
-- там. Сега: когато видеото е на етап „Преглед", екипът го „изпраща на клиента"
-- (линк към Drive). Клиентът го гледа в портала си и с един клик го одобрява,
-- или пише какво да се промени. Решението се връща при екипа като известие.
--
--   * Състоянието живее на content_items (client_review_*), за да върви по
--     вече съществуващия realtime канал и да не иска нова RLS политика.
--   * client_review_log пази историята на кръговете (версия → решение).
--   * portal_get v5: всяко видео носи 'review' САМО ако е изпратено на клиента.
--     Линкът към готовото видео НЕ излиза към портала преди това.
--   * portal_review (anon RPC по токен): клиентът решава само за видео на
--     СВОЯ клиент и само докато чака преглед.
-- Идемпотентна.
-- ============================================================================

alter table content_items add column if not exists client_review_status text not null default '';
alter table content_items add column if not exists client_review_url text not null default '';
alter table content_items add column if not exists client_review_feedback text not null default '';
alter table content_items add column if not exists client_review_by text not null default ''; -- инициали на изпратилия
alter table content_items add column if not exists client_review_sent_at timestamptz;
alter table content_items add column if not exists client_review_decided_at timestamptz;
alter table content_items add column if not exists client_review_log jsonb not null default '[]'::jsonb;

alter table content_items drop constraint if exists content_items_client_review_status_check;
alter table content_items add constraint content_items_client_review_status_check
  check (client_review_status in ('', 'sent', 'approved', 'changes'));

-- ---- Anon RPC: клиентът одобрява / иска промени ---------------------------
create or replace function portal_review(p_token text, p_item text, p_decision text, p_feedback text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_item content_items%rowtype;
  v_feedback text := btrim(coalesce(p_feedback, ''));
  v_body text;
begin
  if p_decision not in ('approved', 'changes') then
    return jsonb_build_object('ok', false, 'error', 'bad_decision');
  end if;
  if p_decision = 'changes' and v_feedback = '' then
    return jsonb_build_object('ok', false, 'error', 'no_feedback');
  end if;

  select p.client_id into v_client_id
  from client_portals p where p.token = p_token and p.active;
  if v_client_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_item from content_items
   where id = p_item and client_id = v_client_id and client_review_status = 'sent'
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;

  update content_items
     set client_review_status = p_decision,
         client_review_feedback = v_feedback,
         client_review_decided_at = now(),
         client_review_log = coalesce(client_review_log, '[]'::jsonb) || jsonb_build_object(
           'decision', p_decision, 'feedback', v_feedback,
           'url', v_item.client_review_url,
           'sent_at', v_item.client_review_sent_at, 'decided_at', now())
   where id = p_item;

  v_body := case when p_decision = 'approved'
    then 'Клиентът одобри видеото „' || coalesce(v_item.title, '') || '“ — може да се качва'
    else 'Клиентът иска промени по „' || coalesce(v_item.title, '') || '“: ' || left(v_feedback, 300)
  end;

  -- Известие към изпратилия и към отговорника на етап „Преглед" (без дубли).
  insert into notifications (id, recipient, actor_name, actor_initials, body, link, entity_type, entity_id, read)
  select 'n-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text || r.who), 1, 6),
         r.who, 'Клиент', 'КЛ', v_body, v_item.id, 'content', v_item.id, false
  from (
    select v_item.client_review_by as who
    union
    select s->>'assignee'
      from jsonb_array_elements(coalesce(v_item.stages, '[]'::jsonb)) s
     where s->>'key' = 'review'
  ) r
  where coalesce(r.who, '') <> '';

  return jsonb_build_object('ok', true, 'status', p_decision);
end;
$$;
revoke all on function portal_review(text, text, text, text) from public;
grant execute on function portal_review(text, text, text, text) to anon, authenticated;

-- ---- portal_get v5: + review на всяко изпратено видео -----------------------
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
$$;
revoke all on function portal_get(text) from public;
grant execute on function portal_get(text) to anon, authenticated;
