-- ============================================================================
-- Live продукция: content_items (видеата с етапите им) и content_cycles
-- влизат в realtime публикацията — смяна на етап/изпълнител/дата, направена
-- от един човек, се появява веднага в отворените сесии на всички останали
-- (както задачите от миграция 0019).
-- ============================================================================

do $$
begin
  alter publication supabase_realtime add table content_items;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table content_cycles;
exception when duplicate_object then null;
end $$;
