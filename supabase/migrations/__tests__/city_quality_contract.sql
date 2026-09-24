-- Fixture tests for the multidimensional city quality contract.
-- Run with: psql "$DATABASE_URL" -f city_quality_contract.sql

begin;

do $test$
declare
  country_a uuid;
  country_b uuid;
  good_id uuid := gen_random_uuid();
  bad_id uuid := gen_random_uuid();
  namesake_a uuid := gen_random_uuid();
  namesake_b uuid := gen_random_uuid();
  placeholder_id uuid := gen_random_uuid();
  linked_event_id uuid := gen_random_uuid();
  legacy_event_id uuid := gen_random_uuid();
  suffix text := substr(gen_random_uuid()::text, 1, 8);
  q public.city_quality_profile%rowtype;
  result_count integer;
  before_image smallint;
  after_image smallint;
  scorecard jsonb;
begin
  select id into country_a from public.countries order by id limit 1;
  select id into country_b from public.countries where id <> country_a order by id limit 1;
  if country_a is null or country_b is null then
    raise exception 'fixture requires at least two countries';
  end if;

  insert into public.cities
    (id, name, slug, country_id, shell_status, seo_indexable, wikidata_qid,
     wikipedia_title, latitude, longitude, timezone, description, field_provenance,
     image_url, population, region_name)
  values
    (good_id, 'Quality Good ' || suffix, 'quality-good-' || suffix, country_a,
     'real', true, 'Q123', 'Quality Good', 47.1, 8.1, 'Europe/Zurich',
     repeat('A factual description grounded in the resolved city identity. ', 5),
     jsonb_build_object('description', jsonb_build_object(
       'source_url', 'https://example.test/city', 'source_identity', 'Q123',
       'retrieved_at', now(),
       'source_hash', encode(extensions.digest(repeat('A factual description grounded in the resolved city identity. ', 5), 'sha256'), 'hex'),
       'language', 'en', 'confidence', 1.0)),
     'https://example.test/' || suffix || '/good.jpg', 100000, 'Fixture Region'),
    (bad_id, 'Quality Bad ' || suffix, 'quality-bad-' || suffix, country_a,
     'real', true, null, null, 0, 0, null,
     'The provided sources do not contain any information about this place.',
     '{}'::jsonb, null, null, null),
    (namesake_a, 'Fixture Berlin ' || suffix, 'fixture-berlin-a-' || suffix, country_a,
     'real', true, 'Q124', 'Fixture Berlin A', 40, -100, 'America/Chicago',
     repeat('A distinct factual description for the first namesake. ', 5), '{}'::jsonb,
     'https://example.test/' || suffix || '/shared.jpg', null, null),
    (namesake_b, 'Fixture Berlin ' || suffix, 'fixture-berlin-b-' || suffix, country_b,
     'real', true, 'Q125', 'Fixture Berlin B', 52, 13, 'Europe/Berlin',
     repeat('A distinct factual description for the second namesake. ', 5), '{}'::jsonb,
     'https://example.test/' || suffix || '/shared.jpg', null, null),
    (placeholder_id, 'Fixture Placeholder ' || suffix, 'tmp-' || suffix, country_a,
     'placeholder', false, null, null, null, null, null, null, '{}'::jsonb,
     null, null, null);

  -- Registry validation is a prerequisite for image completeness credit.
  before_image := public.compute_city_completeness(good_id);
  update public.image_assets ia
  set format = 'jpeg', width = 1600, height = 900, phash = suffix,
      license = 'CC-BY-4.0', source = 'fixture'
  from public.image_asset_links l
  where l.asset_id = ia.id and l.entity_type = 'city' and l.entity_id = good_id and l.role = 'cover';
  after_image := public.compute_city_completeness(good_id);
  if after_image <> before_image + 10 then
    raise exception 'verified image should add exactly 10 completeness points (% -> %)', before_image, after_image;
  end if;

  select * into q from public.city_quality_profile where id = good_id;
  if not q.publication_ready or cardinality(q.blockers) <> 0 then
    raise exception 'positive control city should be publication ready: %', q.blockers;
  end if;

  select * into q from public.city_quality_profile where id = bad_id;
  if not ('CITY_IDENTITY_AMBIGUOUS' = any(q.blockers)
      and 'CITY_GEO_INVALID' = any(q.blockers)
      and 'CITY_DESCRIPTION_WRONG_SUBJECT' = any(q.blockers)) then
    raise exception 'bad fixture did not produce expected blockers: %', q.blockers;
  end if;
  if q.publication_ready then raise exception 'blocked fixture published'; end if;

  select * into q from public.city_quality_profile where id = placeholder_id;
  if q.lifecycle_cohort <> 'unresolved_placeholder'
     or not ('CITY_LIFECYCLE_UNRESOLVED' = any(q.warnings)) then
    raise exception 'placeholder lifecycle was not classified: %, %', q.lifecycle_cohort, q.warnings;
  end if;

  select * into q from public.city_quality_profile where id = namesake_a;
  if not ('CITY_IMAGE_REUSED' = any(q.blockers)) then
    raise exception 'cross-country duplicate image was not blocked: %', q.blockers;
  end if;

  insert into public.events
    (id, title, slug, city, city_id, country_id, event_type, start_date, status,
     is_public, series_next, parent_event_id)
  values
    (linked_event_id, 'Linked namesake fixture', 'linked-event-' || suffix,
     'Fixture Berlin ' || suffix, namesake_b, country_b, 'community',
     now() + interval '10 days', 'active', true, true, null),
    (legacy_event_id, 'Corroborated legacy fixture', 'legacy-event-' || suffix,
     'Fixture Berlin ' || suffix, null, country_a, 'community',
     now() + interval '11 days', 'active', true, true, null);

  select count(*) into result_count
  from public.search_events(
    p_city => 'Fixture Berlin ' || suffix,
    p_city_id => namesake_a,
    p_country_id => country_a,
    p_limit => 100);
  if result_count <> 1 then
    raise exception 'first namesake should receive only its corroborated unlinked event, got %', result_count;
  end if;

  select count(*) into result_count
  from public.search_events(
    p_city => 'Fixture Berlin ' || suffix,
    p_city_id => namesake_b,
    p_country_id => country_b,
    p_limit => 100);
  if result_count <> 1 then
    raise exception 'second namesake should receive only its linked event, got %', result_count;
  end if;

  scorecard := public.city_quality_scorecard();
  if coalesce((scorecard->>'probe_ok')::boolean, false) is not true
     or scorecard->'dimensions' is null or scorecard->'issues' is null then
    raise exception 'scorecard failed closed or omitted required sections: %', scorecard;
  end if;

  if has_function_privilege('anon', 'public.city_quality_scorecard()', 'execute')
     or has_function_privilege('authenticated', 'public._city_quality_scorecard()', 'execute') then
    raise exception 'scorecard privilege boundary exposes an internal quality function';
  end if;
  if not has_function_privilege('authenticated', 'public.city_quality_scorecard()', 'execute')
     or not has_function_privilege('service_role', 'public._city_quality_scorecard()', 'execute') then
    raise exception 'scorecard privilege boundary blocks an intended caller';
  end if;
end
$test$;

-- Exercise the PostgREST caller boundary, not only the postgres-owner path.
-- The authenticated role cannot read the service-only cache directly, while
-- an admin JWT can read it through the guarded security-definer wrapper.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","user_role":"admin","sub":"00000000-0000-0000-0000-000000000001"}',
  true
);

do $staff_test$
declare
  scorecard jsonb;
begin
  scorecard := public.city_quality_scorecard();
  if coalesce((scorecard->>'probe_ok')::boolean, false) is not true then
    raise exception 'authenticated admin scorecard probe failed: %', scorecard;
  end if;
end
$staff_test$;

reset role;

rollback;
