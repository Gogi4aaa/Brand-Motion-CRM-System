-- ============================================================================
-- Task sync, visibility and per-worker client access:
--   * tasks.visibility — 'private' (admin + assignee only) vs 'team' (everyone).
--     Admin-created tasks are private; tasks auto-created from production
--     handoffs are team-visible.
--   * tasks.content_item_id / stage_key — link an auto-created task back to
--     the video + stage that spawned it (closed automatically on handoff).
--   * profiles.client_ids — which clients this member may see. Empty array:
--     workers see NOTHING until assigned; managers see everything (back-compat).
--   * tasks joins the realtime publication so "Платено"/assignments update
--     live in every open session (fixes the stale worker payout view).
-- ============================================================================

alter table tasks add column if not exists visibility text not null default 'team'
  check (visibility in ('private','team'));
alter table tasks add column if not exists content_item_id text;
alter table tasks add column if not exists stage_key text;
create index if not exists tasks_content_item_idx on tasks (content_item_id);

alter table profiles add column if not exists client_ids text[] not null default '{}';

do $$
begin
  alter publication supabase_realtime add table tasks;
exception when duplicate_object then null;
end $$;
