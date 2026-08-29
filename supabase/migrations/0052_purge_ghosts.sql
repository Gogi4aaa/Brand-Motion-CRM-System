-- ============================================================================
-- 0052 — ИЗТРИТО ВИДЕО НЕ ОСТАВЯ СЛЕД СЕБЕ СИ ПРИЗРАЦИ
--
-- Досега при триене на видео:
--   • задачите му оставаха (tasks.content_item_id няма foreign key)
--   • начисленията му ставаха „осиротели“ (on delete set null от 0046)
-- Резултатът бяха редове „(изтрито видео ct-…)“ във Възнаграждения и
-- todo задачи по бордовете за видеа, които не съществуват.
--
-- Правилото сега:
--   НЕЗАРАБОТЕНО и НЕПЛАТЕНО → изчезва заедно с видеото. Не е работа, не е пари.
--   ЗАРАБОТЕНО или ПЛАТЕНО   → ОСТАВА със снимка на заглавието. Това са пари,
--                              които някой е изкарал; те не се трият с видео.
--
-- Идемпотентна.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Тригерът по задачите вече не трие ЗАРАБОТЕНО
-- ---------------------------------------------------------------------------
-- Досега, ако всички задачи по едно видео изчезнеха, начислението се триеше
-- дори когато човекът вече си беше свършил работата и му се дължат пари.
create or replace function public.bm_refresh_earning(p_item text, p_profile uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_total int; v_open int; v_done_at timestamptz;
  v_client text; v_title text; v_row video_earnings; v_id bigint;
begin
  select count(*), count(*) filter (where t.status <> 'done'), max(t.done_at)
    into v_total, v_open, v_done_at
    from tasks t
    join stage_roles sr on sr.stage_key = t.stage_key
    join profiles    p  on p.initials   = t.assignee
   where t.content_item_id = p_item and p.id = p_profile and sr.role_key = p_role;

  select * into v_row from video_earnings
   where content_item_id = p_item and profile_id = p_profile and role_key = p_role;

  if v_row.id is not null and v_row.payout_id is not null then return; end if;

  if v_total = 0 then
    -- Празно начисление си отива; заработеното остава — то е дълг към човека.
    if v_row.id is not null and not v_row.price_locked
       and v_row.earned_at is null and v_row.package_id is null then
      delete from video_earnings where id = v_row.id;
    end if;
    return;
  end if;

  select client_id, coalesce(title, '') into v_client, v_title
    from content_items where id = p_item;
  if v_client is null and v_row.id is null then return; end if;

  if v_row.id is null then
    insert into video_earnings (content_item_id, content_title, profile_id, role_key, client_id, price, earned_at, started_at)
    values (p_item, v_title, p_profile, p_role, v_client,
            bm_video_price(p_profile, p_role, v_client),
            case when v_open = 0 then coalesce(v_done_at, now()) end,
            now())
    returning id into v_id;
    perform bm_attach_package(v_id);
    perform bm_resolve_due(v_id);
    select * into v_row from video_earnings where id = v_id;
  else
    update video_earnings set
      client_id     = coalesce(v_client, v_row.client_id),
      content_title = case when v_title <> '' then v_title else v_row.content_title end,
      price = case when v_row.price_locked then v_row.price
                   when v_row.package_id is not null then v_row.price
                   else bm_video_price(p_profile, p_role, v_client) end,
      earned_at = case when v_open = 0 then coalesce(v_row.earned_at, v_done_at, now()) end
    where id = v_row.id;
    perform bm_resolve_due(v_row.id);
  end if;

  if v_row.package_id is not null then perform bm_refresh_package(v_row.package_id); end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Триенето на видео помита след себе си
-- ---------------------------------------------------------------------------
-- BEFORE DELETE, за да успеем да решим кое остава, преди `on delete set null`
-- да е откъснал връзката.
create or replace function public.bm_purge_content_item()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Празните начисления изчезват с видеото.
  delete from video_earnings
   where content_item_id = old.id and payout_id is null and earned_at is null and package_id is null;

  -- Заработеното/платеното остава, но със снимка, за да е разпознаваемо.
  update video_earnings set
    legacy_item_id = coalesce(legacy_item_id, old.id),
    content_title  = case when coalesce(content_title, '') = ''
                          then coalesce(nullif(old.title, ''), '(изтрито видео)')
                          else content_title end
  where content_item_id = old.id;

  -- Задачите на изтрито видео не подлежат на вършене.
  delete from tasks where content_item_id = old.id;
  return old;
end $$;

drop trigger if exists trg_bm_purge_content_item on content_items;
create trigger trg_bm_purge_content_item before delete on content_items
  for each row execute function public.bm_purge_content_item();

-- ---------------------------------------------------------------------------
-- 3. Изчистване на вече натрупаните
-- ---------------------------------------------------------------------------
do $$
declare v_e int; v_t int;
begin
  -- задачи, сочещи към несъществуващо видео
  delete from tasks t
   where t.content_item_id is not null
     and not exists (select 1 from content_items c where c.id = t.content_item_id);
  get diagnostics v_t = row_count;

  -- осиротели начисления без стойност
  delete from video_earnings
   where content_item_id is null and payout_id is null and earned_at is null and package_id is null;
  get diagnostics v_e = row_count;

  raise notice '0052: изтрити % задачи-призрака и % празни начисления.', v_t, v_e;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Проверка
-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from video_earnings
   where content_item_id is null and payout_id is null and earned_at is null;
  if v > 0 then raise exception '0052: останаха % празни осиротели начисления', v; end if;
  raise notice '0052: няма останали празни призраци.';
end $$;
