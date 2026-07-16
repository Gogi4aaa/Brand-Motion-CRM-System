-- ============================================================================
-- Регистрация с одобрение: нов акаунт чака approved=true от администратор,
-- преди да получи валидиращия имейл и достъп. Заварените акаунти се одобряват
-- наведнъж (те вече работят в системата). profiles.email се пази, за да може
-- админът да прати валидиращия имейл при одобрение (auth.users не се чете от
-- клиента).
-- ============================================================================

alter table profiles add column if not exists approved boolean not null default false;
alter table profiles add column if not exists email text not null default '';

update profiles set approved = true where approved = false;
update profiles p set email = u.email
  from auth.users u
 where u.id = p.id and coalesce(p.email, '') = '';

-- Тригерът за нови акаунти вече пълни и имейла (approved остава false).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, initials, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'name', new.email), 2)),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
