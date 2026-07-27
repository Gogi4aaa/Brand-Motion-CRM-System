-- ============================================================================
-- Профилните снимки вече се пазят като base64 data-URI директно в
-- profiles.avatar_url (виж 0031), а НЕ в Supabase Storage — за да няма
-- постоянни рикуести/egress по безплатния план. Затова махаме неизползвания
-- bucket „avatars“ и политиките му. Колоната profiles.avatar_url остава.
-- ============================================================================

-- Махаме политиките — с тях никой не може да пише в bucket-а, така че той
-- остава напълно инертен (нищо не се качва, нищо не се сервира → 0 рикуести).
drop policy if exists "avatars read" on storage.objects;
drop policy if exists "avatars write" on storage.objects;
drop policy if exists "avatars update" on storage.objects;
drop policy if exists "avatars delete" on storage.objects;

-- Забележка: самият празен bucket „avatars“ не може да се трие с чист SQL
-- (storage.protect_delete го блокира). Без политики е безвреден; ако искаш да
-- изчезне съвсем — изтрий го от Supabase Dashboard → Storage.
