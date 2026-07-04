-- ============================================================================
-- Worker compensation per task:
--   pay_amount — what the assignee earns for this task (set by admin only;
--                enforcement is UI-level like the rest of the app's RBAC).
--   paid / paid_at — set when the admin marks the worker's dues as paid.
-- "Owed" for a worker = sum(pay_amount) of their DONE tasks where paid=false.
-- ============================================================================

alter table tasks add column if not exists pay_amount numeric not null default 0;
alter table tasks add column if not exists paid boolean not null default false;
alter table tasks add column if not exists paid_at timestamptz;
