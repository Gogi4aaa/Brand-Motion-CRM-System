-- ============================================================================
-- Per-user notifications + web-push subscriptions.
--   * notifications: a row per "this needs you" alert, targeted by recipient
--     initials (matches the assignee model used across the app).
--   * push_subscriptions: browser Web Push endpoints, for delivery when the
--     app is closed.
--   * notifications is added to the realtime publication so the bell updates live.
-- ============================================================================

create table if not exists notifications (
  id             text primary key,
  recipient      text not null,                 -- recipient initials
  actor_name     text not null default '',
  actor_initials text not null default '',
  body           text not null,
  link           text not null default '',      -- content item id / route to open
  entity_type    text not null default '',
  entity_id      text not null default '',
  read           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on notifications (recipient, created_at desc);

alter table notifications enable row level security;
drop policy if exists "auth all" on notifications;
create policy "auth all" on notifications for all to authenticated using (true) with check (true);

create table if not exists push_subscriptions (
  id         text primary key,
  recipient  text not null,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_recipient_idx on push_subscriptions (recipient);

alter table push_subscriptions enable row level security;
drop policy if exists "auth all" on push_subscriptions;
create policy "auth all" on push_subscriptions for all to authenticated using (true) with check (true);

-- Live updates for the notification bell (ignore if already in the publication).
do $$
begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;
