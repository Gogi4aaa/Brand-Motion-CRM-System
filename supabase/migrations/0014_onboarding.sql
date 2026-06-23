-- ============================================================================
-- New-client onboarding automation.
--   * Brand profile fields on each client (filled during onboarding).
--   * leads.client_id links a won lead to the client it was converted into,
--     so conversion is idempotent (a lead is onboarded at most once).
-- ============================================================================

alter table clients add column if not exists brand_voice text not null default '';
alter table clients add column if not exists target_audience text not null default '';
alter table clients add column if not exists brand_assets_url text not null default '';

alter table leads add column if not exists client_id text;
