-- cities: create the same-name twins that could not exist before
-- 99991791233840, and move the events and venues that belong to them.
--
-- WHY
-- Until region_code entered the unique keys, cities held one row per
-- (name, country). 20260802090844 and later passes found the consequence
-- twice over:
--   * 147 events stamped enrichment_status.event_city_link.blocked —
--     "same-name-city collision" — left with no city at all;
--   * venues silently on the WRONG same-name city, measured 2026-10-05:
--     around Charleston SC sit 31 venues linked to Charleston, ILLINOIS;
--     around Columbia SC 13 on Columbia, MISSOURI; Springfield MA on
--     Springfield, VERMONT; Wilmington NC on Wilmington, DELAWARE.
--
-- THE TWINS (17). Every QID, label, description and coordinate below was
-- resolved live from Wikidata (wbsearchentities + Special:EntityData) on
-- 2026-10-05, and every description names the state. None of the 17 QIDs is
-- on any cities row; no live US city lies within 2 km of any of them.
-- Created through city_resolve_or_create with p_actor => 'admin' (the only
-- writer of cities), so the unique keys, the split trigger and the
-- region_code trigger all apply exactly as for any other city.
-- Hammond, IN and Orange, CA are deliberately NOT created: their blocked
-- events carry a state string and nothing else (no coordinates, no gaycities
-- metro), which is one signal, not two. A city with no content would be a
-- ghost shell.
--
-- College Park (MD) carried no region_code. An uncoded row is compatible
-- with ANY region hint (city_region_pick), so College Park, GA would have
-- matched it. It gets region_name 'Maryland' first, guarded on lying within
-- 5 km of Wikidata Q668676 (College Park, Maryland, 38.9967/-76.9275;
-- measured 1.6 km).
--
-- EVENTS — linked only on two independent signals beyond the city name:
--   (a) the gaycities metro subdomain of the event's own source names the
--       state (charlestonsc, springfieldmo, portland-maine …) — the ground
--       truth 20260802090844 audited with; or
--   (b) events.state resolves to the twin's region AND the event's own
--       coordinates lie within 25 km of the twin.
-- Measured: 135 events (114 + 8 by metro, 13 by state+coords). The blocked
-- stamp is kept under event_city_link.previous_block, not erased.
--
-- VENUES — city text equals the twin's name AND venues.state resolves to the
-- twin's region AND coordinates within 25 km, and the venue is currently on
-- a same-name city in ANOTHER region or on none. venues.state alone is
-- near-random on this corpus (99991789823216); the coordinate arm is what
-- makes it usable. A venue already on a row of the twin's own region (e.g.
-- North Charleston) is left alone.
--
-- NOT DONE, NAMED
-- * Hammond IN (7 events), Orange CA (1): one signal only, stay blocked.
-- * Venues near a twin whose state text is missing or contradicts are left.
-- * Event coordinates are not written; run_event_geo_fill derives them from
--   the new city's centroid on its next pass.

set local lock_timeout = '10s';

create temp table _twin (
  name    text,
  region  text,   -- region hint passed to the resolver
  code    text,   -- expected region_code
  qid     text,
  lat     numeric,
  lng     numeric,
  metro   text    -- gaycities subdomain, where one exists
) on commit drop;

insert into _twin values
  ('Charleston',   'South Carolina', 'US-SC', 'Q47716',   32.783333, -79.931944, 'charlestonsc'),
  ('Charleston',   'West Virginia',  'US-WV', 'Q44564',   38.347222, -81.633333, 'charlestonwv'),
  ('Columbia',     'South Carolina', 'US-SC', 'Q38453',   34.000556, -81.044167, 'columbiasc'),
  ('Springfield',  'Massachusetts',  'US-MA', 'Q49158',   42.112411, -72.547455, 'springfieldma'),
  ('Springfield',  'Missouri',       'US-MO', 'Q135615',  37.195000, -93.286111, 'springfieldmo'),
  ('Wilmington',   'North Carolina', 'US-NC', 'Q659400',  34.223333, -77.912222, 'wilmingtonnc'),
  ('Portland',     'Maine',          'US-ME', 'Q49201',   43.660000, -70.255000, 'portland-maine'),
  ('Greenville',   'North Carolina', 'US-NC', 'Q1989904', 35.601667, -77.372500, 'greenvillenc'),
  ('Fayetteville', 'North Carolina', 'US-NC', 'Q331104',  35.066667, -78.917500, 'fayettevillenc'),
  ('Lakewood',     'Ohio',           'US-OH', 'Q570990',  41.480833, -81.800278, null),
  ('Hollywood',    'Florida',        'US-FL', 'Q234453',  26.021389, -80.175000, null),
  ('Milton',       'Delaware',       'US-DE', 'Q756111',  38.780000, -75.312800, null),
  ('College Park', 'Georgia',        'US-GA', 'Q388435',  33.648300, -84.456100, null),
  ('Salisbury',    'Massachusetts',  'US-MA', 'Q2002947', 42.841667, -70.861111, null),
  ('Sanford',      'Florida',        'US-FL', 'Q786770',  28.789444, -81.275556, null),
  ('Wellington',   'Florida',        'US-FL', 'Q992652',  26.655000, -80.254167, null),
  ('Arlington',    'Texas',          'US-TX', 'Q17943',   32.705033, -97.122839, null);

-- ---------------------------------------------------------------------------
-- 1. College Park, Maryland gets its region before College Park, Georgia exists
-- ---------------------------------------------------------------------------
update public.cities c
   set region_name = 'Maryland'
  from public.countries co
 where co.id = c.country_id and co.code = 'US'
   and c.name = 'College Park' and c.duplicate_of_id is null
   and c.region_code is null and coalesce(c.region_name, '') = ''
   and c.latitude is not null
   and public.haversine_m(c.latitude, c.longitude, 38.9967, -76.9275) < 5000;

-- ---------------------------------------------------------------------------
-- 2. Create the twins through the resolver
-- ---------------------------------------------------------------------------
create temp table _twin_result (name text, code text, city_id uuid, action text, match_type text, reason text) on commit drop;

do $create$
declare
  t record;
  r record;
begin
  perform set_config('app.actor', 'migration:99991791233856', true);
  for t in select * from _twin loop
    select * into r from public.city_resolve_or_create(
      t.name,
      p_country_code => 'US',
      p_region_hint  => t.region,
      p_lat          => t.lat,
      p_lng          => t.lng,
      p_wikidata_qid => t.qid,
      p_source_slug  => 'migration:99991791233856',
      p_actor        => 'admin');
    insert into _twin_result values (t.name, t.code, r.city_id, r.action, r.match_type, r.reason);
  end loop;
end
$create$;

-- Soft on re-runs: a twin that already exists (matched by QID) is fine.
-- Hard on anything else: a refusal, or a match onto a row of another region.
do $check_create$
declare v_bad text;
begin
  select string_agg(format('%s/%s: %s %s %s', r.name, r.code, r.action, r.match_type, coalesce(r.reason, '')), '; ')
    into v_bad
    from _twin_result r
    left join public.cities c on c.id = r.city_id
   where r.city_id is null or c.region_code is distinct from r.code;
  if v_bad is not null then
    raise exception 'twin creation failed: %', v_bad;
  end if;
end
$check_create$;

-- A twin whose slug got a numeric suffix (portland-1, springfield-2) gets a
-- readable one instead (portland-maine). The original keeps its slug, so no
-- existing URL moves.
update public.cities c
   set slug = public.generate_unique_slug('cities', public.generate_slug(c.name || ' ' || t.region), c.id)
  from _twin_result r
  join _twin t on t.name = r.name and t.code = r.code
 where c.id = r.city_id
   and r.action = 'created'
   and c.slug ~ '-[0-9]+$';

-- ---------------------------------------------------------------------------
-- 3. Events
-- ---------------------------------------------------------------------------
create temp table _ev on commit drop as
select e.id as event_id, r.city_id, t.code,
       case when m.metro = t.metro then 'gaycities_metro:' || t.metro
            else 'state+coords' end as evidence
  from public.events e
  join _twin t on lower(t.name) = lower(e.city)
  join _twin_result r on r.name = t.name and r.code = t.code
  left join lateral (
    select coalesce(es.payload->'metadata'->>'gaycities_subdomain',
                    substring(es.payload::text from '"subdomain": *"([^"]+)"'),
                    substring(es.payload::text from 'https://([a-z-]+)\.gaycities\.com')) as metro
      from public.event_sources es
     where es.event_id = e.id
       and coalesce(es.payload->'metadata'->>'gaycities_subdomain',
                    substring(es.payload::text from '"subdomain": *"([^"]+)"'),
                    substring(es.payload::text from 'https://([a-z-]+)\.gaycities\.com')) = t.metro
     limit 1
  ) m on true
 where e.duplicate_of_id is null
   and e.country = 'US'
   and e.city_id is null
   and e.enrichment_status->'event_city_link' ? 'blocked'
   and ( m.metro is not null
      or ( public.resolve_region_code('US', e.state) = t.code
           and e.latitude is not null
           and public.haversine_m(e.latitude, e.longitude, t.lat, t.lng) < 25000 ) );

-- One event, one twin. A row matching two twins is not linked.
delete from _ev where event_id in (select event_id from _ev group by 1 having count(*) > 1);

update public.events e
   set city_id = v.city_id,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_city_link', jsonb_build_object(
              'linked', true,
              'by', 'migration:99991791233856',
              'at', now(),
              'evidence', v.evidence,
              'region_code', v.code,
              'previous_block', e.enrichment_status->'event_city_link'))
  from _ev v
 where e.id = v.event_id
   and e.city_id is null;

-- ---------------------------------------------------------------------------
-- 4. Venues
-- ---------------------------------------------------------------------------
create temp table _vn on commit drop as
select v.id as venue_id, r.city_id, t.code, v.city_id as from_city_id,
       round(public.haversine_m(v.latitude, v.longitude, t.lat, t.lng))::int as distance_m
  from public.venues v
  join _twin t on lower(t.name) = lower(v.city)
  join _twin_result r on r.name = t.name and r.code = t.code
  left join public.cities cur on cur.id = v.city_id
 where v.duplicate_of_id is null
   and v.latitude is not null
   and public.resolve_region_code('US', v.state) = t.code
   and public.haversine_m(v.latitude, v.longitude, t.lat, t.lng) < 25000
   and exists (select 1 from public.countries co where co.code = 'US' and co.id = coalesce(v.country_id, cur.country_id))
   and ( v.city_id is null
      or ( lower(cur.name) = lower(t.name) and cur.region_code is distinct from t.code ) );

delete from _vn where venue_id in (select venue_id from _vn group by 1 having count(*) > 1);

update public.venues v
   set city_id = n.city_id,
       enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('city_relink', jsonb_build_object(
              'by', 'migration:99991791233856',
              'at', now(),
              'from_city_id', n.from_city_id,
              'evidence', format('city text + state %s + %s m from twin', n.code, n.distance_m)))
  from _vn n
 where v.id = n.venue_id
   and v.city_id is not distinct from n.from_city_id;

-- ---------------------------------------------------------------------------
-- 5. Sentinel: venues whose own city text names ANOTHER existing city of the
-- same country, and which lie within 15 km of that other city — the Burbank
-- shape (99991790978994: venue says Burbank, city_id says Los Angeles).
-- Measured 399 on 2026-10-05 (of 778 venues whose city text disagrees with
-- their linked city at all); most are suburb-vs-metro, a backlog worked by
-- hand. check-pipeline-health warns at the baseline and fails on growth.
-- probe_ok and venues_linked are reported first, so an empty corpus cannot
-- read as a clean one.
-- ---------------------------------------------------------------------------
create or replace function public.venue_city_text_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
  select jsonb_build_object(
    'probe_ok', true,
    'venues_linked', (select count(*) from public.venues v where v.duplicate_of_id is null and v.city_id is not null),
    'city_text_names_nearby_other_city', (
      select count(*)
        from public.venues v
        join public.cities cur on cur.id = v.city_id
        join lateral (
          select c.latitude, c.longitude
            from public.cities c
           where c.country_id = cur.country_id and c.duplicate_of_id is null
             and lower(c.name) = lower(btrim(v.city)) and c.id <> cur.id
             and c.latitude is not null
           order by public.haversine_m(v.latitude, v.longitude, c.latitude, c.longitude)
           limit 1
        ) other on true
       where v.duplicate_of_id is null
         and v.latitude is not null
         and nullif(btrim(v.city), '') is not null
         and lower(btrim(v.city)) <> lower(cur.name)
         and public.haversine_m(v.latitude, v.longitude, other.latitude, other.longitude) < 15000),
    'same_name_cities_without_region', (
      select count(*) from (
        select c.country_id, lower(c.name)
          from public.cities c
         where c.duplicate_of_id is null
         group by 1, 2
        having count(*) > 1 and count(*) filter (where c.region_code is null) > 0) x)
  );
$fn$;

revoke all on function public.venue_city_text_signals() from public, anon, authenticated;
grant execute on function public.venue_city_text_signals() to service_role;

-- ---------------------------------------------------------------------------
-- Postconditions (end state, not write counts)
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_n int;
begin
  -- P1: all 17 twins exist, in their region, with their QID.
  select count(*) into v_n
    from _twin t
    join public.cities c on c.wikidata_qid = t.qid
   where c.region_code = t.code and c.duplicate_of_id is null and lower(c.name) = lower(t.name);
  if v_n <> 17 then
    raise exception 'P1 failed: % of 17 twins present with QID and region', v_n;
  end if;

  -- P2: the originals are untouched — every pre-existing same-name city
  -- still exists with its own region.
  select count(*) into v_n
    from public.cities c join public.countries co on co.id = c.country_id
   where co.code = 'US' and c.duplicate_of_id is null
     and (c.name, c.region_code) in (('Charleston','US-IL'), ('Columbia','US-MO'), ('Springfield','US-VT'),
                                     ('Wilmington','US-DE'), ('Portland','US-OR'), ('College Park','US-MD'));
  if v_n <> 6 then
    raise exception 'P2 failed: % of 6 original same-name cities present with their region', v_n;
  end if;

  -- P3: no event that qualified is still unlinked.
  select count(*) into v_n from _ev v join public.events e on e.id = v.event_id where e.city_id is distinct from v.city_id;
  if v_n <> 0 then
    raise exception 'P3 failed: % qualifying events not on their twin', v_n;
  end if;
  select count(*) into v_n from _ev;
  if v_n < 100 then
    raise exception 'P3b failed: only % events qualified — selector broken?', v_n;
  end if;

  -- P4: no linked event sits on a city of another region than its evidence.
  select count(*) into v_n
    from public.events e join public.cities c on c.id = e.city_id
   where e.enrichment_status->'event_city_link'->>'by' = 'migration:99991791233856'
     and c.region_code is distinct from e.enrichment_status->'event_city_link'->>'region_code';
  if v_n <> 0 then
    raise exception 'P4 failed: % relinked events on a city of another region', v_n;
  end if;

  -- P5: no venue that qualified is still on the wrong same-name city.
  select count(*) into v_n from _vn n join public.venues v on v.id = n.venue_id where v.city_id is distinct from n.city_id;
  if v_n <> 0 then
    raise exception 'P5 failed: % qualifying venues not on their twin', v_n;
  end if;

  -- P7: no twin created here kept a numeric slug suffix.
  select count(*) into v_n
    from _twin_result r join public.cities c on c.id = r.city_id
   where r.action = 'created' and c.slug ~ '-[0-9]+$';
  if v_n <> 0 then
    raise exception 'P7 failed: % twins with numeric slug suffix', v_n;
  end if;

  -- P8: the sentinel runs and sees a corpus.
  if coalesce((public.venue_city_text_signals()->>'venues_linked')::int, 0) = 0 then
    raise exception 'P8 failed: venue_city_text_signals sees no linked venues';
  end if;

  -- P6: Hammond and Orange stay blocked (one signal only).
  select count(*) into v_n
    from public.events e
   where e.duplicate_of_id is null and e.country = 'US' and e.city in ('Hammond', 'Orange')
     and e.enrichment_status->'event_city_link' ? 'blocked'
     and e.city_id is null;
  if v_n < 1 then
    raise exception 'P6 failed: Hammond/Orange blocked events were linked';
  end if;
end
$verify$;
