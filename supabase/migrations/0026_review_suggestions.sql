-- ============================================================================
-- Клиентско одобрение v2: без имейл; клиентът редактира сценария НА МЯСТО.
--   * approvals.suggested_script — предложената от клиента версия (оригиналът
--     в content_items не се пипа; екипът приема/отхвърля от модала).
--   * review_decide получава p_suggested и при „искам промени“:
--       - създава задача „Корекции от клиента“ с висок приоритет за
--         СЦЕНАРИСТА на видеото (от stages, резерва: изпратилия линка),
--       - закача бележката на клиента като коментар по задачата,
--       - нотифицира и сценариста (owner-ът вече се нотифицира).
-- ============================================================================

alter table approvals add column if not exists suggested_script text not null default '';

drop function if exists review_decide(text, text, text, text);

create or replace function review_decide(p_token text, p_decision text, p_feedback text, p_suggested text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval approvals%rowtype;
  v_title text;
  v_script_assignee text;
  v_task_id text;
begin
  if p_decision not in ('approved','changes_requested') then
    raise exception 'invalid decision';
  end if;

  select * into v_approval from approvals where id = p_token and status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_pending');
  end if;

  update approvals
     set status = p_decision,
         feedback = coalesce(p_feedback, ''),
         suggested_script = coalesce(p_suggested, ''),
         decided_at = now()
   where id = p_token;

  select title into v_title from content_items where id = v_approval.content_item_id;

  -- Ping the team member who requested the review.
  if v_approval.owner <> '' then
    insert into notifications (id, recipient, actor_name, actor_initials, body, link, entity_type, entity_id, read)
    values (
      'n-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 6),
      v_approval.owner,
      'Клиент', 'КЛ',
      case when p_decision = 'approved'
        then 'Клиентът одобри „' || coalesce(v_title, '') || '“'
        else 'Клиентът иска промени по „' || coalesce(v_title, '') || '“' ||
             case when coalesce(p_feedback, '') <> '' then ': ' || p_feedback else ' (редактиран сценарий)' end
      end,
      '', 'content', v_approval.content_item_id, false
    );
  end if;

  if p_decision = 'changes_requested' then
    -- Корекциите отиват директно при сценариста на видеото.
    select s->>'assignee' into v_script_assignee
      from content_items c, jsonb_array_elements(coalesce(c.stages, '[]'::jsonb)) s
     where c.id = v_approval.content_item_id and s->>'key' = 'script'
     limit 1;
    if coalesce(v_script_assignee, '') = '' then v_script_assignee := v_approval.owner; end if;

    if coalesce(v_script_assignee, '') <> '' then
      v_task_id := 't-rev-' || substr(md5(random()::text), 1, 10);
      insert into tasks (id, title, client_id, status, priority, assignee, due, progress,
                         estimate_hours, pay_amount, visibility, content_item_id, stage_key)
      values (v_task_id, 'Корекции от клиента: „' || coalesce(v_title, '') || '“',
              v_approval.client_id, 'todo', 'high', v_script_assignee, 'От клиента', 0,
              0, 0, 'private', v_approval.content_item_id, null);

      insert into comments (entity_type, entity_id, author_name, author_initials, body)
      values ('task', v_task_id, 'Клиент', 'КЛ',
              coalesce(nullif(p_feedback, ''), 'Клиентът предложи редактиран сценарий — виж модала на видеото.'));

      if v_script_assignee <> v_approval.owner then
        insert into notifications (id, recipient, actor_name, actor_initials, body, link, entity_type, entity_id, read)
        values (
          'n-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 6),
          v_script_assignee,
          'Клиент', 'КЛ',
          'Корекции по „' || coalesce(v_title, '') || '“ — виж новата си задача',
          '', 'task', v_task_id, false
        );
      end if;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'status', p_decision);
end;
$$;

revoke all on function review_decide(text, text, text, text) from public;
grant execute on function review_decide(text, text, text, text) to anon, authenticated;
