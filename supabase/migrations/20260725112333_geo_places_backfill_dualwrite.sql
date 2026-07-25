-- Geo Hierarchy Unification — P0: backfill the spine from the typed tables
-- (UUID-preserving) and keep it in sync with dual-write triggers + a nightly
-- drift check. search_documents is deliberately untouched in P0.

-- ---------------------------------------------------------------------------
-- Backfill (parents before children so trg_geo_places_derive can resolve them)
-- ~7 continents + 25 regions + 250 countries + ~5200 cities + ~190 villages:
-- one transaction is fine, and geo_places has no search-sync triggers.
-- ---------------------------------------------------------------------------
insert into public.geo_places (id, place_type, parent_id, name, code, created_at, updated_at)
select id, 'continent', null, name, code, created_at, updated_at
from public.continents
on conflict (id) do nothing;

insert into public.geo_places (id, place_type, parent_id, name, created_at, updated_at)
select id, 'region', continent_id, name, created_at, updated_at
from public.regions
on conflict (id) do nothing;

insert into public.geo_places (id, place_type, parent_id, name, name_normalized, name_i18n,
  description, description_i18n, slug, code, latitude, longitude, image_url, image_metadata,
  image_flagged, curated_image_url, duplicate_of_id, seo_indexable, data_source,
  last_refreshed_at, created_at, updated_at)
select id, 'country', coalesce(region_id, continent_id), name, name_normalized, name_i18n,
  description, description_i18n, slug, code, latitude, longitude, image_url, image_metadata,
  image_flagged, curated_image_url, duplicate_of_id, seo_indexable, data_source,
  last_refreshed_at, created_at, updated_at
from public.countries
on conflict (id) do nothing;

insert into public.geo_places (id, place_type, parent_id, name, name_normalized, name_en, name_de,
  name_i18n, description, description_i18n, slug, latitude, longitude, image_url, image_metadata,
  image_flagged, curated_image_url, duplicate_of_id, seo_indexable, data_source,
  last_refreshed_at, created_at, updated_at)
select id, 'city', country_id, name, name_normalized, name_en, name_de,
  name_i18n, description, description_i18n, slug, latitude, longitude, image_url, image_metadata,
  image_flagged, curated_image_url, duplicate_of_id, seo_indexable, data_source,
  last_refreshed_at, created_at, updated_at
from public.cities
on conflict (id) do nothing;

insert into public.geo_places (id, place_type, parent_id, name, name_i18n, description,
  description_i18n, slug, latitude, longitude, image_url, image_metadata, duplicate_of_id,
  seo_indexable, last_refreshed_at, created_at, updated_at)
select id, 'village', city_id, name, name_i18n, description,
  description_i18n, slug, latitude, longitude, image_url, image_metadata, duplicate_of_id,
  seo_indexable, last_refreshed_at, created_at, updated_at
from public.queer_villages
on conflict (id) do nothing;

-- Satellite profiles
insert into public.geo_country_profiles (place_id, capital, population, area_km2, currency,
  languages, timezone, government_type, capital_coordinates, national_anthem, national_day,
  calling_code, internet_tld, driving_side, major_religions, gdp_usd, gdp_per_capita_usd,
  human_development_index, life_expectancy, literacy_rate, climate_zones, natural_resources,
  unesco_sites, major_industries, exports, imports, visa_requirements, flag_emoji,
  national_symbols, airport_codes, major_airports, lgbti_criminalization,
  lgbti_expression_restrictions, lgbti_association_restrictions, lgbti_constitutional_protection,
  lgbti_goods_services_protection, lgbti_health_protection, lgbti_education_protection,
  lgbti_bullying_protection, lgbti_employment_protection, lgbti_housing_protection,
  lgbti_hate_crime_law, lgbti_incitement_prohibition, lgbti_conversion_therapy_regulation,
  lgbti_same_sex_unions, lgbti_adoption_rights, lgbti_intersex_protection,
  lgbti_gender_recognition, lgbti_data_last_updated, equality_score, wolfram_enriched_at,
  last_synced_at, editorial_hook, editorial_long, content_completeness_score,
  enrichment_status, shell_status)
select id, capital, population, area_km2, currency,
  languages, timezone, government_type, capital_coordinates, national_anthem, national_day,
  calling_code, internet_tld, driving_side, major_religions, gdp_usd, gdp_per_capita_usd,
  human_development_index, life_expectancy, literacy_rate, climate_zones, natural_resources,
  unesco_sites, major_industries, exports, imports, visa_requirements, flag_emoji,
  national_symbols, airport_codes, major_airports, lgbti_criminalization,
  lgbti_expression_restrictions, lgbti_association_restrictions, lgbti_constitutional_protection,
  lgbti_goods_services_protection, lgbti_health_protection, lgbti_education_protection,
  lgbti_bullying_protection, lgbti_employment_protection, lgbti_housing_protection,
  lgbti_hate_crime_law, lgbti_incitement_prohibition, lgbti_conversion_therapy_regulation,
  lgbti_same_sex_unions, lgbti_adoption_rights, lgbti_intersex_protection,
  lgbti_gender_recognition, lgbti_data_last_updated, equality_score, wolfram_enriched_at,
  last_synced_at, editorial_hook, editorial_long, content_completeness_score,
  enrichment_status, shell_status
from public.countries
on conflict (place_id) do nothing;

insert into public.geo_city_profiles (place_id, region_name, population, is_capital,
  is_major_city, timezone, elevation_m, climate_type, founded_year, area_km2, local_language,
  official_website, mayor, postal_codes, area_codes, sister_cities, notable_landmarks,
  economy_sectors, universities, transportation_info, demographics, cost_of_living,
  lgbt_friendly_rating, best_time_to_visit, local_customs, airport_codes, major_airport_code,
  wolfram_enriched_at, last_synced_at, historical_names, editorial_hook, trust_score,
  completeness_score, last_verified_at, shell_status, needs_attention, field_provenance,
  enrichment_status, safety_notes, social_links)
select id, region_name, population, is_capital,
  is_major_city, timezone, elevation_m, climate_type, founded_year, area_km2, local_language,
  official_website, mayor, postal_codes, area_codes, sister_cities, notable_landmarks,
  economy_sectors, universities, transportation_info, demographics, cost_of_living,
  lgbt_friendly_rating, best_time_to_visit, local_customs, airport_codes, major_airport_code,
  wolfram_enriched_at, last_synced_at, historical_names, editorial_hook, trust_score,
  completeness_score, last_verified_at, shell_status, needs_attention, field_provenance,
  enrichment_status, safety_notes, social_links
from public.cities
on conflict (place_id) do nothing;

insert into public.geo_village_profiles (place_id, history, images, boundaries,
  notable_landmarks, tags, website, featured, created_by, updated_by, geometry, editorial_hook,
  completeness_score, trust_score, shell_status, needs_attention, field_provenance,
  enrichment_status, last_verified_at, social_links)
select id, history, images, boundaries,
  notable_landmarks, tags, website, featured, created_by, updated_by, geometry, editorial_hook,
  completeness_score, trust_score, shell_status, needs_attention, field_provenance,
  enrichment_status, last_verified_at, social_links
from public.queer_villages
on conflict (place_id) do nothing;

-- ---------------------------------------------------------------------------
-- Dual-write triggers: typed tables remain the system of record; every write
-- mirrors into the spine so P1 (admin tree, breadcrumbs) reads one source.
-- SECURITY DEFINER so RLS on geo_places never blocks the mirror.
-- ---------------------------------------------------------------------------
create or replace function public.sync_geo_spine_continent()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.geo_places where id = old.id and place_type = 'continent';
    return old;
  end if;
  insert into public.geo_places as gp (id, place_type, parent_id, name, code, created_at, updated_at)
  values (new.id, 'continent', null, new.name, new.code, new.created_at, new.updated_at)
  on conflict (id) do update set
    name = excluded.name, code = excluded.code, updated_at = excluded.updated_at
  where gp.place_type = 'continent';
  return new;
end;
$$;

create or replace function public.sync_geo_spine_region()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.geo_places where id = old.id and place_type = 'region';
    return old;
  end if;
  insert into public.geo_places as gp (id, place_type, parent_id, name, created_at, updated_at)
  values (new.id, 'region', new.continent_id, new.name, new.created_at, new.updated_at)
  on conflict (id) do update set
    parent_id = excluded.parent_id, name = excluded.name, updated_at = excluded.updated_at
  where gp.place_type = 'region';
  return new;
end;
$$;

create or replace function public.sync_geo_spine_country()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.geo_places where id = old.id and place_type = 'country';
    return old;
  end if;
  insert into public.geo_places as gp (id, place_type, parent_id, name, name_normalized, name_i18n,
    description, description_i18n, slug, code, latitude, longitude, image_url, image_metadata,
    image_flagged, curated_image_url, duplicate_of_id, seo_indexable, data_source,
    last_refreshed_at, created_at, updated_at)
  values (new.id, 'country', coalesce(new.region_id, new.continent_id), new.name, new.name_normalized,
    new.name_i18n, new.description, new.description_i18n, new.slug, new.code, new.latitude,
    new.longitude, new.image_url, new.image_metadata, new.image_flagged, new.curated_image_url,
    new.duplicate_of_id, new.seo_indexable, new.data_source, new.last_refreshed_at,
    new.created_at, new.updated_at)
  on conflict (id) do update set
    parent_id = excluded.parent_id, name = excluded.name, name_normalized = excluded.name_normalized,
    name_i18n = excluded.name_i18n, description = excluded.description,
    description_i18n = excluded.description_i18n, slug = excluded.slug, code = excluded.code,
    latitude = excluded.latitude, longitude = excluded.longitude, image_url = excluded.image_url,
    image_metadata = excluded.image_metadata, image_flagged = excluded.image_flagged,
    curated_image_url = excluded.curated_image_url, duplicate_of_id = excluded.duplicate_of_id,
    seo_indexable = excluded.seo_indexable, data_source = excluded.data_source,
    last_refreshed_at = excluded.last_refreshed_at, updated_at = excluded.updated_at
  where gp.place_type = 'country';

  insert into public.geo_country_profiles as p (place_id, capital, population, area_km2, currency,
    languages, timezone, government_type, capital_coordinates, national_anthem, national_day,
    calling_code, internet_tld, driving_side, major_religions, gdp_usd, gdp_per_capita_usd,
    human_development_index, life_expectancy, literacy_rate, climate_zones, natural_resources,
    unesco_sites, major_industries, exports, imports, visa_requirements, flag_emoji,
    national_symbols, airport_codes, major_airports, lgbti_criminalization,
    lgbti_expression_restrictions, lgbti_association_restrictions, lgbti_constitutional_protection,
    lgbti_goods_services_protection, lgbti_health_protection, lgbti_education_protection,
    lgbti_bullying_protection, lgbti_employment_protection, lgbti_housing_protection,
    lgbti_hate_crime_law, lgbti_incitement_prohibition, lgbti_conversion_therapy_regulation,
    lgbti_same_sex_unions, lgbti_adoption_rights, lgbti_intersex_protection,
    lgbti_gender_recognition, lgbti_data_last_updated, equality_score, wolfram_enriched_at,
    last_synced_at, editorial_hook, editorial_long, content_completeness_score,
    enrichment_status, shell_status)
  values (new.id, new.capital, new.population, new.area_km2, new.currency,
    new.languages, new.timezone, new.government_type, new.capital_coordinates, new.national_anthem,
    new.national_day, new.calling_code, new.internet_tld, new.driving_side, new.major_religions,
    new.gdp_usd, new.gdp_per_capita_usd, new.human_development_index, new.life_expectancy,
    new.literacy_rate, new.climate_zones, new.natural_resources, new.unesco_sites,
    new.major_industries, new.exports, new.imports, new.visa_requirements, new.flag_emoji,
    new.national_symbols, new.airport_codes, new.major_airports, new.lgbti_criminalization,
    new.lgbti_expression_restrictions, new.lgbti_association_restrictions,
    new.lgbti_constitutional_protection, new.lgbti_goods_services_protection,
    new.lgbti_health_protection, new.lgbti_education_protection, new.lgbti_bullying_protection,
    new.lgbti_employment_protection, new.lgbti_housing_protection, new.lgbti_hate_crime_law,
    new.lgbti_incitement_prohibition, new.lgbti_conversion_therapy_regulation,
    new.lgbti_same_sex_unions, new.lgbti_adoption_rights, new.lgbti_intersex_protection,
    new.lgbti_gender_recognition, new.lgbti_data_last_updated, new.equality_score,
    new.wolfram_enriched_at, new.last_synced_at, new.editorial_hook, new.editorial_long,
    new.content_completeness_score, new.enrichment_status, new.shell_status)
  on conflict (place_id) do update set
    capital = excluded.capital, population = excluded.population, area_km2 = excluded.area_km2,
    currency = excluded.currency, languages = excluded.languages, timezone = excluded.timezone,
    government_type = excluded.government_type, capital_coordinates = excluded.capital_coordinates,
    national_anthem = excluded.national_anthem, national_day = excluded.national_day,
    calling_code = excluded.calling_code, internet_tld = excluded.internet_tld,
    driving_side = excluded.driving_side, major_religions = excluded.major_religions,
    gdp_usd = excluded.gdp_usd, gdp_per_capita_usd = excluded.gdp_per_capita_usd,
    human_development_index = excluded.human_development_index,
    life_expectancy = excluded.life_expectancy, literacy_rate = excluded.literacy_rate,
    climate_zones = excluded.climate_zones, natural_resources = excluded.natural_resources,
    unesco_sites = excluded.unesco_sites, major_industries = excluded.major_industries,
    exports = excluded.exports, imports = excluded.imports,
    visa_requirements = excluded.visa_requirements, flag_emoji = excluded.flag_emoji,
    national_symbols = excluded.national_symbols, airport_codes = excluded.airport_codes,
    major_airports = excluded.major_airports, lgbti_criminalization = excluded.lgbti_criminalization,
    lgbti_expression_restrictions = excluded.lgbti_expression_restrictions,
    lgbti_association_restrictions = excluded.lgbti_association_restrictions,
    lgbti_constitutional_protection = excluded.lgbti_constitutional_protection,
    lgbti_goods_services_protection = excluded.lgbti_goods_services_protection,
    lgbti_health_protection = excluded.lgbti_health_protection,
    lgbti_education_protection = excluded.lgbti_education_protection,
    lgbti_bullying_protection = excluded.lgbti_bullying_protection,
    lgbti_employment_protection = excluded.lgbti_employment_protection,
    lgbti_housing_protection = excluded.lgbti_housing_protection,
    lgbti_hate_crime_law = excluded.lgbti_hate_crime_law,
    lgbti_incitement_prohibition = excluded.lgbti_incitement_prohibition,
    lgbti_conversion_therapy_regulation = excluded.lgbti_conversion_therapy_regulation,
    lgbti_same_sex_unions = excluded.lgbti_same_sex_unions,
    lgbti_adoption_rights = excluded.lgbti_adoption_rights,
    lgbti_intersex_protection = excluded.lgbti_intersex_protection,
    lgbti_gender_recognition = excluded.lgbti_gender_recognition,
    lgbti_data_last_updated = excluded.lgbti_data_last_updated,
    equality_score = excluded.equality_score, wolfram_enriched_at = excluded.wolfram_enriched_at,
    last_synced_at = excluded.last_synced_at, editorial_hook = excluded.editorial_hook,
    editorial_long = excluded.editorial_long,
    content_completeness_score = excluded.content_completeness_score,
    enrichment_status = excluded.enrichment_status, shell_status = excluded.shell_status;
  return new;
end;
$$;

create or replace function public.sync_geo_spine_city()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.geo_places where id = old.id and place_type = 'city';
    return old;
  end if;
  insert into public.geo_places as gp (id, place_type, parent_id, name, name_normalized, name_en,
    name_de, name_i18n, description, description_i18n, slug, latitude, longitude, image_url,
    image_metadata, image_flagged, curated_image_url, duplicate_of_id, seo_indexable, data_source,
    last_refreshed_at, created_at, updated_at)
  values (new.id, 'city', new.country_id, new.name, new.name_normalized, new.name_en, new.name_de,
    new.name_i18n, new.description, new.description_i18n, new.slug, new.latitude, new.longitude,
    new.image_url, new.image_metadata, new.image_flagged, new.curated_image_url,
    new.duplicate_of_id, new.seo_indexable, new.data_source, new.last_refreshed_at,
    new.created_at, new.updated_at)
  on conflict (id) do update set
    parent_id = excluded.parent_id, name = excluded.name, name_normalized = excluded.name_normalized,
    name_en = excluded.name_en, name_de = excluded.name_de, name_i18n = excluded.name_i18n,
    description = excluded.description, description_i18n = excluded.description_i18n,
    slug = excluded.slug, latitude = excluded.latitude, longitude = excluded.longitude,
    image_url = excluded.image_url, image_metadata = excluded.image_metadata,
    image_flagged = excluded.image_flagged, curated_image_url = excluded.curated_image_url,
    duplicate_of_id = excluded.duplicate_of_id, seo_indexable = excluded.seo_indexable,
    data_source = excluded.data_source, last_refreshed_at = excluded.last_refreshed_at,
    updated_at = excluded.updated_at
  where gp.place_type = 'city';

  insert into public.geo_city_profiles as p (place_id, region_name, population, is_capital,
    is_major_city, timezone, elevation_m, climate_type, founded_year, area_km2, local_language,
    official_website, mayor, postal_codes, area_codes, sister_cities, notable_landmarks,
    economy_sectors, universities, transportation_info, demographics, cost_of_living,
    lgbt_friendly_rating, best_time_to_visit, local_customs, airport_codes, major_airport_code,
    wolfram_enriched_at, last_synced_at, historical_names, editorial_hook, trust_score,
    completeness_score, last_verified_at, shell_status, needs_attention, field_provenance,
    enrichment_status, safety_notes, social_links)
  values (new.id, new.region_name, new.population, new.is_capital, new.is_major_city, new.timezone,
    new.elevation_m, new.climate_type, new.founded_year, new.area_km2, new.local_language,
    new.official_website, new.mayor, new.postal_codes, new.area_codes, new.sister_cities,
    new.notable_landmarks, new.economy_sectors, new.universities, new.transportation_info,
    new.demographics, new.cost_of_living, new.lgbt_friendly_rating, new.best_time_to_visit,
    new.local_customs, new.airport_codes, new.major_airport_code, new.wolfram_enriched_at,
    new.last_synced_at, new.historical_names, new.editorial_hook, new.trust_score,
    new.completeness_score, new.last_verified_at, new.shell_status, new.needs_attention,
    new.field_provenance, new.enrichment_status, new.safety_notes, new.social_links)
  on conflict (place_id) do update set
    region_name = excluded.region_name, population = excluded.population,
    is_capital = excluded.is_capital, is_major_city = excluded.is_major_city,
    timezone = excluded.timezone, elevation_m = excluded.elevation_m,
    climate_type = excluded.climate_type, founded_year = excluded.founded_year,
    area_km2 = excluded.area_km2, local_language = excluded.local_language,
    official_website = excluded.official_website, mayor = excluded.mayor,
    postal_codes = excluded.postal_codes, area_codes = excluded.area_codes,
    sister_cities = excluded.sister_cities, notable_landmarks = excluded.notable_landmarks,
    economy_sectors = excluded.economy_sectors, universities = excluded.universities,
    transportation_info = excluded.transportation_info, demographics = excluded.demographics,
    cost_of_living = excluded.cost_of_living, lgbt_friendly_rating = excluded.lgbt_friendly_rating,
    best_time_to_visit = excluded.best_time_to_visit, local_customs = excluded.local_customs,
    airport_codes = excluded.airport_codes, major_airport_code = excluded.major_airport_code,
    wolfram_enriched_at = excluded.wolfram_enriched_at, last_synced_at = excluded.last_synced_at,
    historical_names = excluded.historical_names, editorial_hook = excluded.editorial_hook,
    trust_score = excluded.trust_score, completeness_score = excluded.completeness_score,
    last_verified_at = excluded.last_verified_at, shell_status = excluded.shell_status,
    needs_attention = excluded.needs_attention, field_provenance = excluded.field_provenance,
    enrichment_status = excluded.enrichment_status, safety_notes = excluded.safety_notes,
    social_links = excluded.social_links;
  return new;
end;
$$;

create or replace function public.sync_geo_spine_village()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.geo_places where id = old.id and place_type = 'village';
    return old;
  end if;
  insert into public.geo_places as gp (id, place_type, parent_id, name, name_i18n, description,
    description_i18n, slug, latitude, longitude, image_url, image_metadata, duplicate_of_id,
    seo_indexable, last_refreshed_at, created_at, updated_at)
  values (new.id, 'village', new.city_id, new.name, new.name_i18n, new.description,
    new.description_i18n, new.slug, new.latitude, new.longitude, new.image_url,
    new.image_metadata, new.duplicate_of_id, new.seo_indexable, new.last_refreshed_at,
    new.created_at, new.updated_at)
  on conflict (id) do update set
    parent_id = excluded.parent_id, name = excluded.name, name_i18n = excluded.name_i18n,
    description = excluded.description, description_i18n = excluded.description_i18n,
    slug = excluded.slug, latitude = excluded.latitude, longitude = excluded.longitude,
    image_url = excluded.image_url, image_metadata = excluded.image_metadata,
    duplicate_of_id = excluded.duplicate_of_id, seo_indexable = excluded.seo_indexable,
    last_refreshed_at = excluded.last_refreshed_at, updated_at = excluded.updated_at
  where gp.place_type = 'village';

  insert into public.geo_village_profiles as p (place_id, history, images, boundaries,
    notable_landmarks, tags, website, featured, created_by, updated_by, geometry, editorial_hook,
    completeness_score, trust_score, shell_status, needs_attention, field_provenance,
    enrichment_status, last_verified_at, social_links)
  values (new.id, new.history, new.images, new.boundaries, new.notable_landmarks, new.tags,
    new.website, new.featured, new.created_by, new.updated_by, new.geometry, new.editorial_hook,
    new.completeness_score, new.trust_score, new.shell_status, new.needs_attention,
    new.field_provenance, new.enrichment_status, new.last_verified_at, new.social_links)
  on conflict (place_id) do update set
    history = excluded.history, images = excluded.images, boundaries = excluded.boundaries,
    notable_landmarks = excluded.notable_landmarks, tags = excluded.tags,
    website = excluded.website, featured = excluded.featured, created_by = excluded.created_by,
    updated_by = excluded.updated_by, geometry = excluded.geometry,
    editorial_hook = excluded.editorial_hook, completeness_score = excluded.completeness_score,
    trust_score = excluded.trust_score, shell_status = excluded.shell_status,
    needs_attention = excluded.needs_attention, field_provenance = excluded.field_provenance,
    enrichment_status = excluded.enrichment_status, last_verified_at = excluded.last_verified_at,
    social_links = excluded.social_links;
  return new;
end;
$$;

create trigger trg_sync_geo_spine after insert or update or delete on public.continents
  for each row execute function public.sync_geo_spine_continent();
create trigger trg_sync_geo_spine after insert or update or delete on public.regions
  for each row execute function public.sync_geo_spine_region();
create trigger trg_sync_geo_spine after insert or update or delete on public.countries
  for each row execute function public.sync_geo_spine_country();
create trigger trg_sync_geo_spine after insert or update or delete on public.cities
  for each row execute function public.sync_geo_spine_city();
create trigger trg_sync_geo_spine after insert or update or delete on public.queer_villages
  for each row execute function public.sync_geo_spine_village();

-- ---------------------------------------------------------------------------
-- Drift check: nightly proof the mirror is exact. P2 (FK flips) is gated on a
-- clean week of this.
-- ---------------------------------------------------------------------------
create table public.geo_spine_drift_log (
  id bigint generated always as identity primary key,
  run_at timestamptz not null default now(),
  drift_count integer not null,
  detail jsonb not null
);
alter table public.geo_spine_drift_log enable row level security;
create policy "Admin read geo_spine_drift_log" on public.geo_spine_drift_log
  for select to authenticated
  using (public.has_role_jwt('admin'::public.app_role));

create or replace function public.geo_spine_drift_check()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v jsonb;
  v_total integer;
begin
  select jsonb_build_object(
    'missing_continents', (select count(*) from continents c where not exists (select 1 from geo_places g where g.id = c.id and g.place_type = 'continent')),
    'missing_regions',    (select count(*) from regions r where not exists (select 1 from geo_places g where g.id = r.id and g.place_type = 'region')),
    'missing_countries',  (select count(*) from countries c where not exists (select 1 from geo_places g where g.id = c.id and g.place_type = 'country')),
    'missing_cities',     (select count(*) from cities c where not exists (select 1 from geo_places g where g.id = c.id and g.place_type = 'city')),
    'missing_villages',   (select count(*) from queer_villages qv where not exists (select 1 from geo_places g where g.id = qv.id and g.place_type = 'village')),
    'orphan_spine_rows',  (select count(*) from geo_places g where
                             (g.place_type = 'continent' and not exists (select 1 from continents c where c.id = g.id))
                          or (g.place_type = 'region' and not exists (select 1 from regions r where r.id = g.id))
                          or (g.place_type = 'country' and not exists (select 1 from countries c where c.id = g.id))
                          or (g.place_type = 'city' and not exists (select 1 from cities c where c.id = g.id))
                          or (g.place_type = 'village' and not exists (select 1 from queer_villages qv where qv.id = g.id))),
    'stale_countries', (select count(*) from countries c join geo_places g on g.id = c.id and g.place_type = 'country'
                        where g.name is distinct from c.name or g.slug is distinct from c.slug
                           or g.parent_id is distinct from coalesce(c.region_id, c.continent_id)),
    'stale_cities',    (select count(*) from cities c join geo_places g on g.id = c.id and g.place_type = 'city'
                        where g.name is distinct from c.name or g.slug is distinct from c.slug
                           or g.parent_id is distinct from c.country_id
                           or g.country_id is distinct from c.country_id),
    'stale_villages',  (select count(*) from queer_villages qv join geo_places g on g.id = qv.id and g.place_type = 'village'
                        where g.name is distinct from qv.name or g.slug is distinct from qv.slug
                           or g.parent_id is distinct from qv.city_id)
  ) into v;

  select coalesce(sum(value::int), 0) into v_total from jsonb_each_text(v);
  insert into public.geo_spine_drift_log (drift_count, detail) values (v_total, v);
  -- keep 60 days of runs
  delete from public.geo_spine_drift_log where run_at < now() - interval '60 days';
  return jsonb_build_object('drift_count', v_total, 'detail', v);
end;
$$;

revoke execute on function public.geo_spine_drift_check() from public, anon, authenticated;

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('geo_spine_drift_check', 'Geo spine drift check',
        'Nightly: verifies the geo_places spine exactly mirrors continents/regions/countries/cities/queer_villages during the strangler migration. P2 (FK flips) requires a clean week.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"geo_spine_drift_check"}'::jsonb, '40 4 * * *')
on conflict (slug) do update set schedule=excluded.schedule, enabled=excluded.enabled,
  description=excluded.description, name=excluded.name, action=excluded.action, trigger=excluded.trigger;

select cron.schedule('geo_spine_drift_check', '40 4 * * *',
  $cron$ select public.geo_spine_drift_check(); $cron$);
