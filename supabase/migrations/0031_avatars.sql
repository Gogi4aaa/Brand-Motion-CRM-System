-- ============================================================================
-- Профилни снимки на екипа. Самите изображения НЕ влизат в базата — те се
-- качват в Storage bucket-а „avatars“ (CDN), а в profiles пазим само късия
-- публичен URL. Клиентът смалява снимката до ~128px JPEG преди качване, така
-- че всеки аватар тежи няколко KB и мястото е пренебрежимо.
-- ============================================================================

alter table profiles add column if not exists avatar_url text;

-- Публичен bucket: четенето е отворено (аватарите се показват из целия UI),
-- писането — само за логнати. Пътят на файла е <profile_id>.jpg и се презаписва
-- при всяка нова снимка (upsert), затова bucket-ът не расте с времето.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 524288,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Всеки логнат член може да качва/сменя/трие аватари (пътят е по profile_id;
-- админът сменя и чужди снимки от таба „Екип“). Четенето е публично.
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars write" on storage.objects;
create policy "avatars write" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists "avatars update" on storage.objects;
create policy "avatars update" on storage.objects
  for update to authenticated using (bucket_id = 'avatars') with check (bucket_id = 'avatars');

drop policy if exists "avatars delete" on storage.objects;
create policy "avatars delete" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars');
