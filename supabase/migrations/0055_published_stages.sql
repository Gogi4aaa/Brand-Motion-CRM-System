-- ============================================================================
-- 0055 — ПУБЛИКУВАНО ВИДЕО = ВСИЧКИ ЕТАПИ ГОТОВИ
--
-- Бъг: до Продукция водеха два пътя към „публикувано“:
--   • маркиране на последния етап като готов → етапите се обновяваха правилно
--   • влачене в колоната „Приключени“ (completeVideo) → published=true, но
--     `stages` оставаше както си беше
-- Затова на вече качено видео панелът „кой какво прави“ показваше
-- „Публикуване · В процес“. 26 от 33 публикувани видеа бяха в това състояние.
--
-- Кодът е поправен; тук се изчистват натрупаните и се слага предпазител, за да
-- важи правилото и при промени извън приложението.
--
-- Идемпотентна.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Изчистване на натрупаните
-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  update content_items ci
     set stages = (
       select jsonb_agg(jsonb_set(s, '{status}', '"done"'))
         from jsonb_array_elements(ci.stages) s
     )
   where coalesce(ci.published, false)
     and ci.stages is not null
     and jsonb_typeof(ci.stages) = 'array'
     and exists (select 1 from jsonb_array_elements(ci.stages) s where s->>'status' <> 'done');
  get diagnostics v = row_count;
  raise notice '0055: изравнени % публикувани видеа.', v;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Предпазител: щом published стане true, етапите се затварят
-- ---------------------------------------------------------------------------
-- Пази правилото и когато промяната идва отвън (SQL, друг клиент, импорт).
create or replace function public.bm_close_stages_on_publish()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.published, false)
     and new.stages is not null
     and jsonb_typeof(new.stages) = 'array'
     and exists (select 1 from jsonb_array_elements(new.stages) s where s->>'status' <> 'done')
  then
    new.stages := (select jsonb_agg(jsonb_set(s, '{status}', '"done"'))
                     from jsonb_array_elements(new.stages) s);
  end if;
  return new;
end $$;

drop trigger if exists trg_bm_close_stages on content_items;
create trigger trg_bm_close_stages before insert or update on content_items
  for each row execute function public.bm_close_stages_on_publish();

-- ---------------------------------------------------------------------------
-- 3. Проверка
-- ---------------------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v from content_items ci
   where coalesce(ci.published, false)
     and ci.stages is not null and jsonb_typeof(ci.stages) = 'array'
     and exists (select 1 from jsonb_array_elements(ci.stages) s where s->>'status' <> 'done');
  if v > 0 then raise exception '0055: останаха % публикувани с незавършени етапи', v; end if;
  raise notice '0055: всички публикувани видеа са с готови етапи.';
end $$;
