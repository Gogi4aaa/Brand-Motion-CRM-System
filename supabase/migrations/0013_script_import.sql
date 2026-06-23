-- ============================================================================
-- Script import: each content item carries its own script body (rich text),
-- imported from a .docx and editable in-app. First step of replacing
-- Google Docs / Notion as the source of truth for scripts.
-- ============================================================================

alter table content_items add column if not exists script text not null default '';
