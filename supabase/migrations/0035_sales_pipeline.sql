-- ============================================================================
-- Продажби (надграден „Сделки"): реален sales-процес.
--   * source — откъде идва лийдът (студен/препоръка/входящо/…).
--   * referred_by_client_id / referred_by_name — при „Препоръка": връзка към
--     съществуващ клиент ИЛИ свободно име на външен препоръчител.
--   * Нови етапи: new → meeting → proposal → won → lost (махнат е „contacted";
--     заварените contacted лийдове минават консервативно към „new", защото
--     „свързан" не означава проведена среща).
-- ============================================================================

alter table leads add column if not exists source text not null default 'cold';
alter table leads add column if not exists referred_by_client_id text
  references clients(id) on delete set null;
alter table leads add column if not exists referred_by_name text not null default '';

update leads set stage = 'new' where stage = 'contacted';

alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check
  check (stage in ('new','meeting','proposal','won','lost'));
