-- ============================================================================
-- Бранд профил на клиента (въпросникът от onboarding-а):
--   * brand_profiles — един ред на клиент; отговорите на 19-те въпроса живеят
--     в answers (jsonb), защото въпросите се менят без миграции (lib/brand.ts).
--     Попълва се от екипа през импорт на .docx или ръчна редакция; клиентът
--     няма директен достъп (публичен линк може да се добави по-късно).
--   Полетата brand_voice/target_audience/brand_assets_url върху clients (0014)
--   остават и се огледално обновяват при запис — AI контекстът ги чете.
-- ============================================================================

create table if not exists brand_profiles (
  client_id  text primary key references clients(id) on delete cascade,
  answers    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table brand_profiles enable row level security;

drop policy if exists "auth all" on brand_profiles;
create policy "auth all" on brand_profiles for all to authenticated using (true) with check (true);
