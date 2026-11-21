create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated;
create table public.venues (id uuid primary key default gen_random_uuid(), name text, description text, description_i18n jsonb,
  duplicate_of_id uuid, closed_at timestamptz, safety_gated boolean not null default false, category text, quality_score int, created_at timestamptz default now());
create table public.events (id uuid primary key default gen_random_uuid(), title text not null, description text, title_i18n jsonb, description_i18n jsonb,
  venue_name text, start_date timestamptz, end_date timestamptz, duplicate_of_id uuid, safety_gated boolean not null default false);
create table public.organizations (id uuid primary key default gen_random_uuid(), name text, description text, status text default 'active', safety_gated boolean not null default false, created_at timestamptz default now());
create table public.content_translations (id uuid primary key default gen_random_uuid(), table_name text not null, record_id uuid not null, field_name text not null,
  language text not null, value text not null, status text not null default 'draft' check (status in ('draft','published','machine','human_reviewed')),
  translated_by uuid, machine_source text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index content_translations_unique on public.content_translations(table_name, record_id, field_name, language);
create table public.i18n_translation_targets (id uuid primary key default gen_random_uuid(), table_name text, field text, locale text, enabled boolean default true);
insert into public.i18n_translation_targets(table_name, field, locale) select t, f, l from (values ('venues','description'),('events','title'),('events','description'),('cities','name')) v(t,f), unnest(array['de','fr']) l;
grant select on all tables in schema public to service_role;
