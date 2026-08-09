-- Phase 2b — persist the categorical rights verdict alongside equality_score.
--
-- The engine is supabase/functions/_shared/rights/verdict.ts. This adds only
-- the narrow stored tuple; the full evidence is recomputed client-side from
-- the same row, which costs zero extra bytes because LGBTJurisdictionInfo
-- already receives the whole country.
--
-- `equality_score` is NOT touched. It stays as the deprecated projection until
-- every consumer has migrated (Phase 2c), and it is still what the
-- `crim_consistency` release gate asserts against.
--
-- Storage: ~120 bytes x 250 rows ~= 30 KB. Written by the nightly ILGA
-- importer inside the UPDATE it already issues, so this adds zero extra writes
-- and zero extra trg_search_documents_country fires on a disk-constrained DB.

alter table public.countries
  add column if not exists rights_verdicts jsonb,
  add column if not exists rights_verdict_general text;

alter table public.geo_country_profiles
  add column if not exists rights_verdicts jsonb,
  add column if not exists rights_verdict_general text;

-- The vocabulary, enforced. `unknown` is a real member: a country we hold too
-- little about must be storable AS unknown rather than defaulted into the
-- middle of the scale, which is the whole defect being fixed.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'countries_rights_verdict_general_chk'
  ) then
    alter table public.countries
      add constraint countries_rights_verdict_general_chk
      check (rights_verdict_general is null or rights_verdict_general in
        ('criminalized-severe','criminalized','hostile','partial','protected','unknown'))
      not valid;
  end if;
end $$;

-- Partial: the column is null until the importer first runs, and the discovery
-- surfaces only ever filter on a non-null value.
create index if not exists idx_countries_rights_verdict_general
  on public.countries (rights_verdict_general)
  where rights_verdict_general is not null;

comment on column public.countries.rights_verdicts is
  'Per-lens categorical verdict {general,lgb,trans,intersex} -> {v,cov}. Computed by '
  '_shared/rights/verdict.ts. `general` is worstOf() and is for SORTING/FILTERING ONLY — '
  'render the per-lens split, never the single word: 228 of 250 countries record intersex '
  'protection as No, so collapsed to one adjective Germany reads "hostile".';

comment on column public.countries.rights_verdict_general is
  'Denormalised rights_verdicts->general->>v, for SQL filters and indexes.';

-- The geo-spine dual-write enumerates every column in THREE places (insert
-- list, values, on-conflict set). A column missed in any of them silently
-- never mirrors, and geo_spine_drift_check() compares only name/slug/parent_id
-- so nothing would alarm. Body transcribed from pg_proc.prosrc (NOT from the
-- migration file, which may have been CREATE OR REPLACE'd since) with the two
-- new columns added to all three.
create or replace function public.sync_geo_spine_country()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    enrichment_status, shell_status, rights_verdicts, rights_verdict_general)
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
    new.content_completeness_score, new.enrichment_status, new.shell_status,
    new.rights_verdicts, new.rights_verdict_general)
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
    enrichment_status = excluded.enrichment_status, shell_status = excluded.shell_status,
    rights_verdicts = excluded.rights_verdicts,
    rights_verdict_general = excluded.rights_verdict_general;
  return new;
end;
$function$;
