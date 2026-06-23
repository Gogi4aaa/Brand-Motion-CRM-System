-- ============================================================================
-- Content backlog: videos can exist without a date (unscheduled) and be
-- drag-dropped onto the calendar to plan a publish date.
-- ============================================================================

alter table content_items alter column date drop not null;
