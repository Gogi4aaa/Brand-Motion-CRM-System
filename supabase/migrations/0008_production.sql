-- ============================================================================
-- Video production workflow — per-stage assignees + status on each content item.
-- ============================================================================

-- Role tags per team member (strategy/script/camera/editor/review).
alter table profiles add column if not exists roles text[] not null default '{}';

-- Each client's default editor (initials); editors are brand-specific.
alter table clients add column if not exists editor text not null default '';

-- Production pipeline stored on the content item:
--   current_stage = which column the video sits in on the board
--   stages = jsonb array of { key, assignee, status }
alter table content_items add column if not exists current_stage text not null default 'analysis';
alter table content_items add column if not exists stages jsonb not null default '[]'::jsonb;
