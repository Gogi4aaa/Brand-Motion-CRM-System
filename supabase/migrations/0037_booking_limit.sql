-- ============================================================================
-- Лимит: клиентът може да има най-много 3 активни снимачни дни (pending+approved)
-- едновременно. Re-create на portal_book с проверката (declined не се броят).
-- ============================================================================

create or replace function portal_book(p_token text, p_date date, p_start time, p_end time, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_client_name text;
  v_active int;
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

  select count(*) into v_active
  from shoot_bookings
  where client_id = v_client_id and status in ('pending','approved');
  if v_active >= 3 then
    return jsonb_build_object('ok', false, 'error', 'limit');
  end if;

  v_id := 'sb-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 6);
  insert into shoot_bookings (id, client_id, date, start_time, end_time, note, status)
  values (v_id, v_client_id, p_date, p_start, p_end, coalesce(p_note, ''), 'pending');

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
