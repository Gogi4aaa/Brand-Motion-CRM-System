-- ============================================================================
-- Снимачни дни: клиентът заявява дата+час от портала (анонимно), админът одобрява.
--   * shoot_bookings — заявките (pending/approved/declined).
--   * calendar_feeds — таен токен за .ics абонамент (личен календар на админа).
--   * portal_book (anon RPC) — прави заявка + известява админите (модел review_decide).
--   * bookings_ics (anon RPC) — одобрените снимания за .ics feed-а.
--   * portal_get — разширен: + busy (заетите одобрени слотове на ВСИЧКИ клиенти,
--     без имена) и bookings (собствените заявки на клиента със статус).
-- ============================================================================

create table if not exists shoot_bookings (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  date       date not null,
  start_time time,
  end_time   time,
  note       text not null default '',
  status     text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists shoot_bookings_date_idx on shoot_bookings (date);
create index if not exists shoot_bookings_client_idx on shoot_bookings (client_id);

create table if not exists calendar_feeds (
  token      text primary key,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table shoot_bookings enable row level security;
alter table calendar_feeds enable row level security;
drop policy if exists "auth all" on shoot_bookings;
drop policy if exists "auth all" on calendar_feeds;
create policy "auth all" on shoot_bookings for all to authenticated using (true) with check (true);
create policy "auth all" on calendar_feeds for all to authenticated using (true) with check (true);

-- Realtime за админ панела (нова заявка се появява live).
alter publication supabase_realtime add table shoot_bookings;

-- ---- Anon RPC: клиентът прави заявка от портала --------------------------
create or replace function portal_book(p_token text, p_date date, p_start time, p_end time, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_client_name text;
  v_id text;
begin
  select p.client_id, cl.name into v_client_id, v_client_name
  from client_portals p join clients cl on cl.id = p.client_id
  where p.token = p_token and p.active;
  if v_client_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if p_date is null or p_date < current_date then
    return jsonb_build_object('ok', false, 'error', 'bad_date');
  end if;

  v_id := 'sb-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 6);
  insert into shoot_bookings (id, client_id, date, start_time, end_time, note, status)
  values (v_id, v_client_id, p_date, p_start, p_end, coalesce(p_note, ''), 'pending');

  -- Известие към всеки админ (клиентът няма логин → RPC-то пише вместо notify()).
  insert into notifications (id, recipient, actor_name, actor_initials, body, link, entity_type, entity_id, read)
  select 'n-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text || pr.initials), 1, 6),
         pr.initials, 'Клиент', 'КЛ',
         v_client_name || ' заяви снимачен ден ' || to_char(p_date, 'DD.MM')
           || coalesce(' ' || to_char(p_start, 'HH24:MI'), ''),
         '/bookings', 'booking', v_id, false
  from profiles pr
  where pr.role = 'admin';

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function portal_book(text, date, time, time, text) from public;
grant execute on function portal_book(text, date, time, time, text) to anon, authenticated;

-- ---- Anon RPC: одобрените снимания за .ics feed --------------------------
create or replace function bookings_ics(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'date', b.date,
      'start', to_char(b.start_time, 'HH24:MI'),
      'end', to_char(b.end_time, 'HH24:MI'),
      'client', cl.name, 'note', b.note
    ) order by b.date, b.start_time)
    from shoot_bookings b join clients cl on cl.id = b.client_id
    where b.status = 'approved'
  ), '[]'::jsonb)
  from calendar_feeds f
  where f.token = p_token and f.active;
$$;
revoke all on function bookings_ics(text) from public;
grant execute on function bookings_ics(text) to anon, authenticated;

-- ---- portal_get v3: + busy + bookings ------------------------------------
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
