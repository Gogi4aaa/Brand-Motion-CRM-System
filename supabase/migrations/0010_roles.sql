-- ============================================================================
-- Role levels: admin / manager / worker. New users default to 'worker'
-- (admin promotes them in the Users panel). Existing 'member' → 'worker'.
-- ============================================================================

alter table profiles alter column role set default 'worker';
update profiles set role = 'worker' where role = 'member';

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin','manager','worker'));
