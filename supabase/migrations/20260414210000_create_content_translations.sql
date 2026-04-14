-- Content translations table for multi-language support
-- Stores translations for any content table (venues, events, cms_pages, etc.)

create table if not exists public.content_translations (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  field_name text not null,
  language text not null,
  value text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'machine', 'human_reviewed')),
  translated_by uuid references auth.users(id) on delete set null,
  machine_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One translation per (table, record, field, language) combination
create unique index if not exists content_translations_unique
  on public.content_translations(table_name, record_id, field_name, language);

-- Fast lookup: all translations for a record in a given language
create index if not exists content_translations_lookup
  on public.content_translations(table_name, record_id, language);

-- Coverage queries: how many translations exist per table/language
create index if not exists content_translations_coverage
  on public.content_translations(table_name, language, status);

-- Auto-update updated_at
create or replace function public.update_content_translations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger content_translations_updated_at
  before update on public.content_translations
  for each row execute function public.update_content_translations_updated_at();

-- RLS
alter table public.content_translations enable row level security;

-- Public: read published translations
create policy "Published translations are publicly readable"
  on public.content_translations for select
  using (status = 'published');

-- Admins: full access (uses existing is_admin() helper if available, else service_role)
create policy "Admins can manage translations"
  on public.content_translations for all
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('admin', 'moderator')
    )
  );

-- DB function: get translated fields for a single record
create or replace function public.get_translated_content(
  p_table text,
  p_id uuid,
  p_lang text,
  p_fields text[] default '{}'::text[]
)
returns jsonb
language sql stable
as $$
  select coalesce(
    jsonb_object_agg(field_name, value),
    '{}'::jsonb
  )
  from public.content_translations
  where table_name = p_table
    and record_id = p_id
    and language = p_lang
    and status = 'published'
    and (array_length(p_fields, 1) is null or field_name = any(p_fields));
$$;

-- DB function: batch get translations for multiple records
create or replace function public.get_translated_list(
  p_table text,
  p_ids uuid[],
  p_lang text,
  p_fields text[] default '{}'::text[]
)
returns table(record_id uuid, translations jsonb)
language sql stable
as $$
  select
    ct.record_id,
    jsonb_object_agg(ct.field_name, ct.value)
  from public.content_translations ct
  where ct.table_name = p_table
    and ct.record_id = any(p_ids)
    and ct.language = p_lang
    and ct.status = 'published'
    and (array_length(p_fields, 1) is null or ct.field_name = any(p_fields))
  group by ct.record_id;
$$;
