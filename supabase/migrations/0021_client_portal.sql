-- ============================================================================
-- Client portal (собственикът на бизнеса гледа, без логин):
--   * client_portals — one unguessable token per client; the public
--     /portal/<token> page resolves everything through the SECURITY DEFINER
--     RPC portal_get (same pattern as the review magic links).
--   * video_metrics — резултати от качените видеа (гледания, харесвания…),
--     въвеждани ръчно от админа или дърпани автоматично където платформата
--     позволява (/api/metrics/fetch).
-- ============================================================================

create table if not exists client_portals (
  token      text primary key,
  client_id  text not null references clients(id) on delete cascade,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists client_portals_client_idx on client_portals (client_id);

create table if not exists video_metrics (
  id              text primary key,
  content_item_id text not null references content_items(id) on delete cascade,
  platform        text not null default '',
  url             text not null default '',
  views           bigint not null default 0,
  likes           bigint not null default 0,
  comments        bigint not null default 0,
  shares          bigint not null default 0,
  source          text not null default 'manual' check (source in ('manual','auto')),
  updated_at      timestamptz not null default now()
);
create unique index if not exists video_metrics_item_idx on video_metrics (content_item_id);

alter table client_portals enable row level security;
alter table video_metrics enable row level security;

drop policy if exists "auth all" on client_portals;
drop policy if exists "auth all" on video_metrics;
create policy "auth all" on client_portals for all to authenticated using (true) with check (true);
create policy "auth all" on video_metrics  for all to authenticated using (true) with check (true);

-- The public portal payload: client name + every video with its stage
-- progress and (if published) metrics. Internal fields (сценарий, бележки,
-- изпълнители) deliberately stay out — the owner sees progress, not kitchen.
create or replace function portal_get(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'client_name', cl.name,
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
