-- Schema polish: per-entity i18n columns + events.timezone override
--
-- Picks up the small additive items from
-- docs/search-intelligence/06-risks-and-roadmap.md "Polish" section:
--
--   * events.timezone — override column for adapters that store local times
--     instead of UTC. Optional; falls back to cities.timezone, then UTC.
--   * Per-entity name_i18n / title_i18n / description_i18n columns
--     mirroring #155 for unified_tags. Adds them for venues, events,
--     news_articles, marketplace_listings, personalities, queer_villages,
--     cities, countries.
--   * unified_tags.image_alt_i18n + image_attribution_i18n — locale-aware
--     fields for tag images.
--   * Per-entity localized fallback RPCs (one consistent pattern across
--     all types) so callers don't repeat the locale-> en -> raw fallback.
--
-- Pure additive. No existing column or value is altered. The new columns
-- default to '{}' jsonb so they're invisible until populated.

-- ── events.timezone ─────────────────────────────────────────────────────────
alter table public.events
  add column if not exists timezone text;

comment on column public.events.timezone is
  'Override timezone for the event start/end dates. NULL => fall back to cities.timezone via city_id, then UTC. Adapters that store TIMESTAMPTZ in UTC should leave this NULL.';

-- ── Per-entity i18n columns ─────────────────────────────────────────────────
-- Helper to apply name + description i18n columns idempotently.
do $$
declare t text;
begin
  -- venues / personalities / queer_villages / cities / countries / hotels use `name`
  foreach t in array array['venues','personalities','queer_villages','cities','countries','hotels']
  loop
    execute format(
      'alter table public.%I
        add column if not exists name_i18n        jsonb not null default ''{}''::jsonb,
        add column if not exists description_i18n jsonb not null default ''{}''::jsonb',
      t
    );
    -- shape guard: object only (matches #155 unified_tags behaviour)
    execute format($q$
      do $b$ begin
        if not exists (
          select 1 from pg_constraint
          where conrelid = 'public.%1$s'::regclass and conname = '%1$s_name_i18n_object'
        ) then
          alter table public.%1$I
            add constraint %1$s_name_i18n_object check (jsonb_typeof(name_i18n) = 'object');
        end if;
        if not exists (
          select 1 from pg_constraint
          where conrelid = 'public.%1$s'::regclass and conname = '%1$s_description_i18n_object'
        ) then
          alter table public.%1$I
            add constraint %1$s_description_i18n_object check (jsonb_typeof(description_i18n) = 'object');
        end if;
      end $b$
    $q$, t);
  end loop;

  -- events / news_articles / marketplace_listings use `title`
  foreach t in array array['events','news_articles','marketplace_listings']
  loop
    execute format(
      'alter table public.%I
        add column if not exists title_i18n       jsonb not null default ''{}''::jsonb,
        add column if not exists description_i18n jsonb not null default ''{}''::jsonb',
      t
    );
    execute format($q$
      do $b$ begin
        if not exists (
          select 1 from pg_constraint
          where conrelid = 'public.%1$s'::regclass and conname = '%1$s_title_i18n_object'
        ) then
          alter table public.%1$I
            add constraint %1$s_title_i18n_object check (jsonb_typeof(title_i18n) = 'object');
        end if;
        if not exists (
          select 1 from pg_constraint
          where conrelid = 'public.%1$s'::regclass and conname = '%1$s_description_i18n_object'
        ) then
          alter table public.%1$I
            add constraint %1$s_description_i18n_object check (jsonb_typeof(description_i18n) = 'object');
        end if;
      end $b$
    $q$, t);
  end loop;
end $$;

-- ── unified_tags image alt/attribution i18n ─────────────────────────────────
alter table public.unified_tags
  add column if not exists image_alt_i18n         jsonb not null default '{}'::jsonb,
  add column if not exists image_attribution_i18n jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.unified_tags'::regclass
      and conname = 'unified_tags_image_alt_i18n_object'
  ) then
    alter table public.unified_tags
      add constraint unified_tags_image_alt_i18n_object
      check (jsonb_typeof(image_alt_i18n) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.unified_tags'::regclass
      and conname = 'unified_tags_image_attribution_i18n_object'
  ) then
    alter table public.unified_tags
      add constraint unified_tags_image_attribution_i18n_object
      check (jsonb_typeof(image_attribution_i18n) = 'object');
  end if;
end $$;

-- ── Localized fallback RPCs ────────────────────────────────────────────────
-- One per (entity, field). All follow the same locale -> "en" -> raw column
-- fallback chain that #155 established for unified_tags.
-- Stable + read-only; granted to anon for storefront use.

create or replace function public.venue_localized_name(
  p_id uuid, p_locale text default 'en'
) returns text language sql stable as $$
  select coalesce(t.name_i18n->>p_locale, t.name_i18n->>'en', t.name)
  from public.venues t where t.id = p_id
$$;

create or replace function public.venue_localized_description(
  p_id uuid, p_locale text default 'en'
) returns text language sql stable as $$
  select coalesce(t.description_i18n->>p_locale, t.description_i18n->>'en', t.description)
  from public.venues t where t.id = p_id
$$;

create or replace function public.event_localized_title(
  p_id uuid, p_locale text default 'en'
) returns text language sql stable as $$
  select coalesce(t.title_i18n->>p_locale, t.title_i18n->>'en', t.title)
  from public.events t where t.id = p_id
$$;

create or replace function public.event_localized_description(
  p_id uuid, p_locale text default 'en'
) returns text language sql stable as $$
  select coalesce(t.description_i18n->>p_locale, t.description_i18n->>'en', t.description)
  from public.events t where t.id = p_id
$$;

create or replace function public.news_article_localized_title(
  p_id uuid, p_locale text default 'en'
) returns text language sql stable as $$
  select coalesce(t.title_i18n->>p_locale, t.title_i18n->>'en', t.title)
  from public.news_articles t where t.id = p_id
$$;

create or replace function public.marketplace_listing_localized_title(
  p_id uuid, p_locale text default 'en'
) returns text language sql stable as $$
  select coalesce(t.title_i18n->>p_locale, t.title_i18n->>'en', t.title)
  from public.marketplace_listings t where t.id = p_id
$$;

-- effective_event_timezone: override -> city -> UTC
create or replace function public.effective_event_timezone(p_event_id uuid)
returns text language sql stable as $$
  select coalesce(
    nullif(e.timezone, ''),
    nullif(c.timezone, ''),
    'UTC'
  )
  from public.events e
  left join public.cities c on c.id = e.city_id
  where e.id = p_event_id
$$;

revoke all on function public.venue_localized_name(uuid, text)                from public;
revoke all on function public.venue_localized_description(uuid, text)         from public;
revoke all on function public.event_localized_title(uuid, text)               from public;
revoke all on function public.event_localized_description(uuid, text)         from public;
revoke all on function public.news_article_localized_title(uuid, text)        from public;
revoke all on function public.marketplace_listing_localized_title(uuid, text) from public;
revoke all on function public.effective_event_timezone(uuid)                  from public;

grant execute on function public.venue_localized_name(uuid, text)                to anon, authenticated, service_role;
grant execute on function public.venue_localized_description(uuid, text)         to anon, authenticated, service_role;
grant execute on function public.event_localized_title(uuid, text)               to anon, authenticated, service_role;
grant execute on function public.event_localized_description(uuid, text)         to anon, authenticated, service_role;
grant execute on function public.news_article_localized_title(uuid, text)        to anon, authenticated, service_role;
grant execute on function public.marketplace_listing_localized_title(uuid, text) to anon, authenticated, service_role;
grant execute on function public.effective_event_timezone(uuid)                  to anon, authenticated, service_role;

comment on function public.effective_event_timezone(uuid) is
  'Resolves the timezone an event should be displayed in: events.timezone override -> cities.timezone -> UTC.';
