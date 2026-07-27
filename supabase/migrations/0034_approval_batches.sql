-- ============================================================================
-- Групово одобрение: един линк за много сценарии наведнъж.
--   * approval_batches — един неотгатваем токен → един клиент → много видеа.
--     Публичната страница /review/group/<token> ги резолва през SECURITY DEFINER
--     RPC review_batch_get (същия модел като review_get / portal_get).
--   * approvals.batch_token — всяко видео в групата ПАЗИ собствен approvals ред
--     (собствено решение, feedback, suggested_script), просто вързан към групата.
--     Така review_decide и целият екипен код работят без промяна, per-video.
--     Старите единични линкове остават с batch_token = NULL и продължават да работят.
-- ============================================================================

create table if not exists approval_batches (
  token      text primary key,           -- long random token; part of the public URL
  client_id  text not null references clients(id) on delete cascade,
  owner      text not null default '',    -- team member (initials) who created it
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists approval_batches_client_idx on approval_batches (client_id);

alter table approvals add column if not exists batch_token text
  references approval_batches(token) on delete cascade;
create index if not exists approvals_batch_idx on approvals (batch_token);

alter table approval_batches enable row level security;
drop policy if exists "auth all" on approval_batches;
create policy "auth all" on approval_batches for all to authenticated using (true) with check (true);

-- Публичният payload на групата: име на клиента + всяко видео с решението си и
-- пълното съдържание за преглед (като review_get, но агрегирано като portal_get).
-- Всеки елемент носи approval_id — груповата страница решава per-video чрез
-- съществуващото review_decide(approval_id, …), затова то остава непроменено.
create or replace function review_batch_get(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'client_name', coalesce(cl.name, ''),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'approval_id',     a.id,
        'content_item_id', a.content_item_id,
        'status',          a.status,
        'feedback',        a.feedback,
        'decided_at',      a.decided_at,
        'title',           c.title,
        'type',            c.type,
        'script',          c.script,
        'hook',            c.hook,
        'cta',             c.cta,
        'caption',         c.caption,
        'hashtags',        c.hashtags,
        'notes',           c.notes,
        'date',            c.date
      ) order by a.created_at)
      from approvals a
      join content_items c on c.id = a.content_item_id
      where a.batch_token = p_token
    ), '[]'::jsonb)
  )
  from approval_batches b
  join clients cl on cl.id = b.client_id
  where b.token = p_token and b.active;
$$;

revoke all on function review_batch_get(text) from public;
grant execute on function review_batch_get(text) to anon, authenticated;
