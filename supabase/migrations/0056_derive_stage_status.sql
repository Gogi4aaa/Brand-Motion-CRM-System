-- ============================================================================
-- 0056 — СЪСТОЯНИЕТО НА ЕТАП СЕ ИЗВЕЖДА, НЕ СЕ ВЪВЕЖДА
--
-- Падащото меню за статус на всеки етап беше второ копие на факт, който
-- колонката в Продукция вече казва. От 396 етапа 395 имаха точно статуса, който
-- се извежда от позицията — единственият смисъл на полето беше да се
-- разсинхронизира (виж 0055: 26 публикувани видеа с „Публикуване · В процес“).
--
-- Правилото сега, наложено от базата:
--   преди текущия етап → done
--   текущият          → doing
--   след него         → todo
--   публикувано       → всички done
--
-- Полето `stages[].status` ОСТАВА, защото го четат клиентският портал
-- (portal_get) и календарът. Просто вече никой не го въвежда на ръка.
--
-- Заменя тесния тригер от 0055 (той гледаше само публикуваното).
-- Идемпотентна.
-- ============================================================================

create or replace function public.bm_derive_stage_status()
returns trigger
language plpgsql
as $$
declare
  v_order text[];
  v_cur   int;
begin
  if new.stages is null or jsonb_typeof(new.stages) <> 'array'
     or jsonb_array_length(new.stages) = 0 then
    return new;
  end if;

  -- Редът на етапите зависи от типа: постовете имат по-къса верига.
  v_order := case when new.type = 'post'
    then array['strategy','script','copy','design','review','publish']
    else array['strategy','script','shoot','edit','review','publish'] end;

  v_cur := coalesce(array_position(v_order, coalesce(new.current_stage, v_order[1])), 1);

  new.stages := (
    select jsonb_agg(
      jsonb_set(s, '{status}', to_jsonb(
        case
          when coalesce(new.published, false) then 'done'
          when coalesce(array_position(v_order, s->>'key'), v_cur) <  v_cur then 'done'
          when coalesce(array_position(v_order, s->>'key'), v_cur) =  v_cur then 'doing'
          else 'todo'
        end))
      order by coalesce(array_position(v_order, s->>'key'), 99)
    )
    from jsonb_array_elements(new.stages) s
  );
  return new;
end $$;

drop trigger if exists trg_bm_close_stages on content_items;
drop trigger if exists trg_bm_derive_stage_status on content_items;
create trigger trg_bm_derive_stage_status before insert or update on content_items
  for each row execute function public.bm_derive_stage_status();

-- ---- Изравняване на съществуващите -----------------------------------------
-- Празният update задейства тригера за всеки ред.
do $$
declare v int;
begin
  update content_items set stages = stages
   where stages is not null and jsonb_typeof(stages) = 'array' and jsonb_array_length(stages) > 0;
  get diagnostics v = row_count;
  raise notice '0056: изравнени % видеа.', v;
end $$;

-- ---- Проверка ---------------------------------------------------------------
do $$
declare v int;
begin
  with ord as (
    select ci.id, ci.published, ci.current_stage,
           case when ci.type = 'post'
                then array['strategy','script','copy','design','review','publish']
                else array['strategy','script','shoot','edit','review','publish'] end as ord,
           s->>'key' as k, s->>'status' as st
      from content_items ci, jsonb_array_elements(ci.stages) s
     where ci.stages is not null and jsonb_typeof(ci.stages) = 'array'
  )
  select count(*) into v from ord
   where st <> case
     when coalesce(published,false) then 'done'
     when coalesce(array_position(ord, k), 1) < coalesce(array_position(ord, coalesce(current_stage, ord[1])), 1) then 'done'
     when coalesce(array_position(ord, k), 1) = coalesce(array_position(ord, coalesce(current_stage, ord[1])), 1) then 'doing'
     else 'todo' end;
  if v > 0 then raise exception '0056: останаха % етапа, които не следват позицията', v; end if;
  raise notice '0056: всички етапи следват позицията си.';
end $$;
