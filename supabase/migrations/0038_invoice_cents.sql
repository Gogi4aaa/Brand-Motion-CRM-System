-- ============================================================================
-- Сумите по фактурите вече поддържат стотинки/центове (напр. 50.30), а не само
-- цели числа. Колоната amount става numeric(12,2) вместо integer.
-- ============================================================================

alter table invoices alter column amount type numeric(12,2) using amount::numeric(12,2);
alter table invoices alter column amount set default 0;
