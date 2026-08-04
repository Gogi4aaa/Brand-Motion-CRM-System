-- ============================================================================
-- Задържане на клиенти: нов статус „Напуснал" (Churned) + дата на напускане, за
-- да смятаме задържане (created_at → churned_at) и churn %. created_at вече го има.
-- ============================================================================

alter table clients add column if not exists churned_at timestamptz;

alter table clients drop constraint if exists clients_status_check;
alter table clients add constraint clients_status_check
  check (status in ('Active', 'At risk', 'Onboarding', 'Churned'));
