-- unified_tags.name_i18n + description_i18n
--
-- Adds multilingual columns to unified_tags as called out in
-- docs/search-intelligence/02-unified-model.md (section 8: Multilingual handling).
-- Existing single-language `name` and `description` columns remain the source of
-- truth for English; the new JSONB columns hold per-locale variants
-- ({"en": "...", "de": "...", ...}).
--
-- Additive only. Existing readers continue to work without changes. Future
-- ingestion / UI code can opt in via the helper RPCs introduced here.

alter table public.unified_tags
  add column if not exists name_i18n        jsonb not null default '{}'::jsonb,
  add column if not exists description_i18n jsonb not null default '{}'::jsonb;

-- Cheap shape guard: reject non-object jsonb (arrays / scalars) at write time.
-- Skips application if the constraint already exists from a prior partial run.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.unified_tags'::regclass
      and conname = 'unified_tags_name_i18n_object'
  ) then
    alter table public.unified_tags
      add constraint unified_tags_name_i18n_object
      check (jsonb_typeof(name_i18n) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.unified_tags'::regclass
      and conname = 'unified_tags_description_i18n_object'
  ) then
    alter table public.unified_tags
      add constraint unified_tags_description_i18n_object
      check (jsonb_typeof(description_i18n) = 'object');
  end if;
end $$;

-- Indexes: GIN on name_i18n keys + values (for prefix/contains lookup),
-- partial since most rows will start empty.
create index if not exists unified_tags_name_i18n_gin
  on public.unified_tags using gin (name_i18n)
  where name_i18n <> '{}'::jsonb;

-- ── Helper RPC: localized name with English fallback ─────────────────────────
-- Returns the localized string for `p_locale`; if absent, falls back to
-- name_i18n[en], then to the existing `name` column. Stable + read-only,
-- safe for use in views and search-projection code.
create or replace function public.unified_tag_localized_name(
  p_tag_id uuid,
  p_locale text default 'en'
) returns text
language sql
stable
as $$
  select coalesce(
    (t.name_i18n ->> p_locale),
    (t.name_i18n ->> 'en'),
    t.name
  )
  from public.unified_tags t
  where t.id = p_tag_id
$$;

create or replace function public.unified_tag_localized_description(
  p_tag_id uuid,
  p_locale text default 'en'
) returns text
language sql
stable
as $$
  select coalesce(
    (t.description_i18n ->> p_locale),
    (t.description_i18n ->> 'en'),
    t.description
  )
  from public.unified_tags t
  where t.id = p_tag_id
$$;

revoke all on function public.unified_tag_localized_name(uuid, text) from public;
grant execute on function public.unified_tag_localized_name(uuid, text)
  to anon, authenticated, service_role;

revoke all on function public.unified_tag_localized_description(uuid, text) from public;
grant execute on function public.unified_tag_localized_description(uuid, text)
  to anon, authenticated, service_role;

comment on column public.unified_tags.name_i18n is
  'Per-locale tag names: {"en": "...", "de": "..."}. Falls back to name column when locale missing.';
comment on column public.unified_tags.description_i18n is
  'Per-locale tag descriptions. Falls back to description column when locale missing.';
comment on function public.unified_tag_localized_name(uuid, text) is
  'Returns the localized tag name with locale -> en -> name fallback chain.';
