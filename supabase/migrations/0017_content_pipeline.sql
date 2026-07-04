-- ============================================================================
-- Content production pipeline upgrade:
--   * ideas          — Idea Bank: raw ideas/hooks collected before production;
--                      "promote" creates a content_item and links back.
--   * approvals      — client review via magic link (the approval id IS the
--                      token in the public /review/[token] URL). Decisions are
--                      read/written through SECURITY DEFINER RPCs so the anon
--                      role never needs table access.
--   * content_items  — structured script fields (hook/cta) + caption/hashtags.
--   * tasks          — estimate_hours for the workload view.
-- ============================================================================

-- ---- Idea Bank --------------------------------------------------------------
create table if not exists ideas (
  id          text primary key,
  client_id   text references clients(id) on delete cascade,
  title       text not null,
  description text not null default '',
  hook        text not null default '',
  source      text not null default 'team'
              check (source in ('team','client_brief','trend','competitor','ai')),
  status      text not null default 'backlog'
              check (status in ('backlog','approved','promoted','archived')),
  votes       integer not null default 0,
  created_by  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists ideas_client_idx on ideas (client_id, status);

alter table ideas enable row level security;
drop policy if exists "auth all" on ideas;
create policy "auth all" on ideas for all to authenticated using (true) with check (true);

-- ---- Structured script + caption on content items ---------------------------
alter table content_items add column if not exists hook      text not null default '';
alter table content_items add column if not exists hook_type text not null default '';
alter table content_items add column if not exists cta       text not null default '';
alter table content_items add column if not exists caption   text not null default '';
alter table content_items add column if not exists hashtags  text not null default '';

-- ---- Workload estimates ------------------------------------------------------
alter table tasks add column if not exists estimate_hours numeric not null default 0;

-- ---- Client approvals (magic-link review) ------------------------------------
create table if not exists approvals (
  id              text primary key,           -- long random token; part of the public URL
  content_item_id text not null references content_items(id) on delete cascade,
  client_id       text not null default '',
  owner           text not null default '',   -- team member (initials) to notify on decision
  status          text not null default 'pending'
                  check (status in ('pending','approved','changes_requested')),
  approver_email  text not null default '',
  feedback        text not null default '',
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists approvals_item_idx on approvals (content_item_id);

alter table approvals enable row level security;
drop policy if exists "auth all" on approvals;
create policy "auth all" on approvals for all to authenticated using (true) with check (true);

-- ---- Public review RPCs -------------------------------------------------------
-- The review page is public (no login). The anon role has NO table access;
-- it can only call these functions, which look rows up strictly by the
-- unguessable token. SECURITY DEFINER lets them bypass RLS for that one row.

create or replace function review_get(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'status',      a.status,
    'feedback',    a.feedback,
    'decided_at',  a.decided_at,
    'title',       c.title,
    'type',        c.type,
    'script',      c.script,
    'hook',        c.hook,
    'cta',         c.cta,
    'caption',     c.caption,
    'hashtags',    c.hashtags,
    'notes',       c.notes,
    'client_name', coalesce(cl.name, ''),
    'date',        c.date
  )
  from approvals a
  join content_items c on c.id = a.content_item_id
  left join clients cl on cl.id = c.client_id
  where a.id = p_token;
$$;

create or replace function review_decide(p_token text, p_decision text, p_feedback text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval approvals%rowtype;
  v_title text;
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
         approver_email = coalesce(p_email, ''),
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
        else 'Клиентът иска промени по „' || coalesce(v_title, '') || '“: ' || coalesce(p_feedback, '')
      end,
      '', 'content', v_approval.content_item_id, false
    );
  end if;

  return jsonb_build_object('ok', true, 'status', p_decision);
end;
$$;

revoke all on function review_get(text) from public;
revoke all on function review_decide(text, text, text, text) from public;
grant execute on function review_get(text) to anon, authenticated;
grant execute on function review_decide(text, text, text, text) to anon, authenticated;
