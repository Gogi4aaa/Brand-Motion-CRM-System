-- ============================================================================
-- „Корекции": какво да се поправи по монтираното видео. Пише ги отговорникът на
-- етап „Преглед", монтажистът ги отмята като отстранени. Държим ги отделно от
-- „Бележки" (брифа), за да са на едно място и лесно четими за монтажистите.
-- ============================================================================

alter table content_items add column if not exists corrections text not null default '';
alter table content_items add column if not exists corrections_done boolean not null default false;
alter table content_items add column if not exists corrections_by text not null default ''; -- инициали на автора
alter table content_items add column if not exists corrections_at timestamptz;
