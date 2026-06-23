-- ============================================================================
-- Refinements: per-client business analysis + published flag on content.
-- ============================================================================

alter table clients add column if not exists analysis_status text not null default 'not_started';
alter table clients add column if not exists analysis_notes  text not null default '';

alter table content_items add column if not exists published boolean not null default false;
