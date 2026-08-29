-- ============================================================================
-- 0054 — ПРИЕМАНЕТО НАДДЕЛЯВА НАД СЪСТОЯНИЕТО НА ЗАДАЧИТЕ
--
-- Бъг, хванат при проверката на синхронизацията с Продукция:
--   1. Админът приема видео → accepted_at и earned_at се попълват
--   2. Някой мръдне картата в Продукция (или само статуса на задача)
--   3. bm_refresh_earning преизчислява earned_at от задачите → НУЛИРА ГО
--   Резултат: „прието = да, заработено = не, платимо €0“ и видеото изчезва
--   от месечната сметка. Човекът не получава пари за приета работа.
--
-- Правилото сега: ПРИЕТОТО е решение на админа и нищо автоматично не го отменя.
-- Отменя се само изрично, през bm_return_video (връщане за преправка).
--
-- Същото важи и за триенето: начисление с accepted_at не се трие, дори когато
-- всичките му задачи изчезнат.
--
-- Идемпотентна.
-- ============================================================================

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

  -- Платеното не се пипа.
  if v_row.id is not null and v_row.payout_id is not null then return; end if;

  if v_total = 0 then
    -- Празно начисление си отива. ПРИЕТОТО и заработеното остават — това са
    -- пари, които някой е изкарал, а не следа от задача.
    if v_row.id is not null and not v_row.price_locked
       and v_row.earned_at is null and v_row.accepted_at is null and v_row.package_id is null then
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
      -- ⬇ ЯДРОТО НА ПОПРАВКАТА
      earned_at = case
                    when v_row.accepted_at is not null then v_row.earned_at  -- приетото не мърда
                    when v_open = 0 then coalesce(v_row.earned_at, v_done_at, now())
                    else null
                  end
    where id = v_row.id;
    perform bm_resolve_due(v_row.id);
  end if;

  if v_row.package_id is not null then perform bm_refresh_package(v_row.package_id); end if;
end $$;

-- ---------------------------------------------------------------------------
-- Оправяне на вече разсинхронизираните редове
-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  update video_earnings
     set earned_at = coalesce(earned_at, accepted_at)
   where accepted_at is not null and earned_at is null;
  get diagnostics v = row_count;
  if v > 0 then raise notice '0054: върнати % приети начисления, останали без заработено.', v;
  else raise notice '0054: няма разсинхронизирани редове.'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Проверка
-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from video_earnings where accepted_at is not null and earned_at is null;
  if v > 0 then raise exception '0054: останаха % приети без заработено', v; end if;
  raise notice '0054: приетото вече не се губи при движение в Продукция.';
end $$;
