-- ============================================================================
-- Изтриване на потребител от админа (контрол на нежелани регистрации).
-- SECURITY DEFINER — изпълнява се с права на postgres, но пуска само
-- администратори (is_admin() от 0020) и никога самия себе си. Изтриването
-- от auth.users каскадно маха профила (FK on delete cascade от 0001).
-- ============================================================================

create or replace function admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  delete from auth.users where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function admin_delete_user(uuid) from public;
revoke all on function admin_delete_user(uuid) from anon;
grant execute on function admin_delete_user(uuid) to authenticated;
