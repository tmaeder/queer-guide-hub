-- Cities whose stored country is contradicted by their own coordinates.
--
-- 25 rows repaired, 2 deliberately not, and a detector added that can see them.
--
-- WHY THE EXISTING DETECTOR COULD NEVER FIND THESE. `city_country_contradictions()`
-- (20260910144242) derives the true country from CHILD CONTENT: it joins
-- `events`, reads `events.country`, and requires `events_with_code > 0`. That is a
-- good signal for a city that HAS events. Every row here has zero events and zero
-- venues -- they are `personality-birth-place` / `*-city-match` placeholder shells
-- -- so the join eliminates all of them before any comparison runs. A row with no
-- children cannot contradict itself. The polygon test below needs no children at
-- all, which is why this is a second detector rather than a widening of the first.
--
-- THE ORACLE WAS ALREADY IN THE DATABASE. `geo_boundaries` holds 258
-- `boundary_kind='country'` polygons, all with geometry. No new dependency, no
-- reverse-geocode call, no heuristic k-NN vote over neighbouring cities.
--
-- WHY A NAIVE "POLYGON DISAGREES => FIX IT" SWEEP WOULD HAVE BEEN A DISASTER.
-- The raw test reports 50 contradictions on 5,090 coordinate-bearing live cities.
-- Hand-read, only 27 are real, and the 23 false positives land on exactly the
-- rows that matter most. Two classes:
--
--   (a) DEPENDENT TERRITORIES. Reunion (RE), Martinique (MQ), French Guiana (GF)
--       and Bonaire (BQ) have NO polygon of their own in `geo_boundaries`; their
--       points fall inside the SOVEREIGN's polygon, so the test reports FR/NL
--       against our more-specific and CORRECT stored code. The existing
--       `sovereign_iso_a2` guard does not catch this: it handles a territory
--       POLYGON whose sovereign matches the stored country, not a SOVEREIGN
--       polygon containing a territory. Hence the `stored country must have its
--       own polygon` rule -- holding no polygon for a code means we cannot
--       adjudicate it, so we abstain.
--
--   (b) BORDER PRECISION. Rows within ~2 km of the stored country's own border,
--       where low-precision coordinates fall across the line: Gibraltar 0.4 km,
--       Podcetrtek (SI, on the Croatian border) 0.7, Siebengewald (NL, on the
--       German border) 1.3, Goerlitz and Guben (DE, on the Neisse), Burghausen
--       (DE, on the Salzach), Chene-Bougeries (CH, Geneva), Puerto Eldorado (AR,
--       Parana), Yacuiba (BO), and "City of Niagara Falls" at 0.1 km, which
--       straddles the US/CA line by name as much as by position.
--
-- ALL SIX `seo_indexable` CONTRADICTIONS ARE FALSE POSITIVES -- Cilaos, Les
-- Trois-Ilets, Podcetrtek, City of Niagara Falls, Gibraltar, Siebengewald. The
-- raw detector's precision on the subset the public can actually see is 0/6.
-- Every row repaired below is deindexed, content-less and slug `tmp-%`. Quote
-- that number before anyone proposes running this automatically.
--
-- THE TWO SIGNALS THAT SURVIVE, either of which qualifies a row:
--   * >= 50 km from the stored country's own polygon -- far past any plausible
--     rounding or border artifact. The nearest true positive above the bar is
--     Lucerne at 59.2 km; the furthest false positive below it is Basel at 1.8 km.
--   * the row's OWN NAME names the polygon country ("Vienna, Austria" stored DE,
--     "Berlin, Germany" stored SE). An independent signal, and the only thing
--     that rescues the four genuine defects inside 50 km -- Geneva 3.3, Antwerp
--     14.8, Luxembourg City 18.2, Basel 1.8 -- all real border cities whose
--     distance alone can never distinguish them from class (b).
--
-- TWO ROWS QUALIFY AND ARE STILL NOT REPAIRED, because `cities` cannot hold
-- them. `uk_cities_country_name_active` is UNIQUE (country_id, name_normalized)
-- WHERE duplicate_of_id IS NULL, so moving a row into its true country can
-- collide with a row already there. The first dry run of this migration died on
-- exactly that, which is the same wall the 2026-08 pass hit when it recorded
-- `blocked_name_collision_in_target`. The two are NOT the same problem:
--
--   * Concord (CZ -> US) collides with "Concord " at 43.207,-71.537.
--
--     A first draft of this comment said the two were Concord NEW HAMPSHIRE and
--     Concord NORTH CAROLINA, 1,164 km apart, and that a disambiguating rename
--     would let both exist. THAT IS WRONG and is recorded here so nobody acts on
--     it. BOTH rows carry field_provenance enriched from the SAME Wikipedia
--     article -- Concord, North Carolina: identical coordinate candidate
--     35.410,-80.585, identical image Downtown_Concord_NC_5.jpg, identical
--     description "Cabarrus County, North Carolina", identical website
--     concordnc.gov, population 94130, area 159.98, founded 1796. The twin
--     STORES 43.207,-71.537 with no provenance entry for that value, so its
--     stored coordinates contradict its own recorded candidates, and the MHT/PSM
--     airports that make it look like New Hampshire were derived FROM those
--     stored coordinates, not independently. Its one personality gives
--     birth_place "Concord (CA, US)" -- California, a third place.
--
--     Both shells were enriched by looking up the bare name "Concord", which
--     returns the most populous Concord. That is the namesake chimera this
--     codebase documents for /city/daphne resolving to the Greek nymph, so for
--     THIS row the coordinates are not independent evidence of anything and the
--     polygon verdict must not be acted on. Neither row's identity is
--     established; renaming either one would invent a fact. Left as-is, still
--     flagged, and the dedup pair reopened with this evidence.
--
--     The collision guard therefore does double duty: measured, NONE of the 25
--     repaired rows has a same-name twin anywhere in the corpus, so excluding the
--     colliding rows also excludes exactly the rows whose bare-name enrichment
--     cannot be trusted. A same-name twin IS the signal that a name lookup was
--     ambiguous.
--
-- COORDINATE PROVENANCE, since the above makes it load-bearing: all 25 repaired
-- rows have field_provenance.coords sourced from wikipedia, so the coordinates
-- alone would inherit whatever the name lookup resolved to. What makes them
-- trustworthy here is that each article's own prose names the country and agrees
-- with the polygon in 25 of 25 -- Bussum "in the Gooi region" of the Netherlands,
-- Jena "the second largest city in Thuringia", Neuhausen "/Erzgeb." in Saxony,
-- Norton "in the Mid Suffolk district", Oskemen "in eastern Kazakhstan", Palmdale
-- "in northern Los Angeles County" -- combined with the zero-twin measurement
-- above. Read the description before adding a row to this list.
--
--   * Lyss (IT -> CH) collides with "Lyss" at 47.081,7.294 while ours is at
--     47.067,7.300 -- 1.6 km apart, i.e. the SAME TOWN. That is a duplicate, not
--     a wrong-country row, and the fix is a merge.
--
-- WHICH TURNED OUT TO BE A CLASS, NOT ONE ROW. Asking the general question --
-- does a contradicting row have a same-name twin in the country its coordinates
-- point at? -- returns four pairs, and the DISTANCE BETWEEN THE TWO ROWS splits
-- them: Martigny 0.5 km, Lyss 1.6 km, Les Trois-Ilets 2.8 km are each one town
-- stored twice, so all three are queued for merge review by the loop below
-- (deriving the pairs rather than naming them, so the rule is re-checkable).
-- The fourth is Concord at 1,164 km, and it is NOT queued -- but read the
-- Concord note above before concluding that distance proves the two are
-- different places. It does not: the 1,164 km is measured against a stored
-- coordinate that the row's own provenance contradicts. Concord is excluded here
-- because its identity is UNKNOWN, not because it is known to be two cities.
-- The nightly sweep can never propose any of these pairs: its city arm blocks on
-- country, and by construction they disagree on it.
--
-- OTHER EXCLUSIONS:
--   * El Aaiun (EH -> MA) and Thebes (ES -> EG) are `shell_status='ghost'`, so
--     the detector filters them before any verdict -- they are not on an
--     exclusion list, they are simply not visible to it. Worth stating because
--     the two look identical from the outside: Western Sahara is disputed and EH
--     is a legitimate ISO 3166 code, so even if it were visible it would not be
--     ours to settle in a data migration.
--   * Deutsch-Ostafrika (TZ -> BI) and Rio Grande Valley (MX -> US) are visible
--     but abstain on border precision. Both are non-places anyway -- a defunct
--     colonial polity and a US region -- and belong to the
--     `archive_city_as_nonplace` flow; repairing their country would make a
--     non-place look better maintained than it is.
--   * Enniskillen (IE -> GB, 16.6 km). Geographically Northern Ireland, but it
--     clears neither signal and the stored value is politically freighted.
--   * Martigny (12.6 km), Lippen (31 km), Strzelce Opolskie (45.5 km) -- almost
--     certainly wrong, under the bar, no name corroboration. Conservative misses.
--     `city_country_polygon_conflicts()` reports them on every run, so they stay
--     visible work rather than lost work.
--
-- WRITER IS `apply_city_country_repair`, NOT AN UPDATE. That function
-- repropagates country_id to venues / events / hotels / organizations / guides /
-- queer_villages / personalities AND recomputes `safety_gated` from the country
-- that actually changed. Its own header records that `SET city_id = city_id` is a
-- silent no-op which left a safety gate open, measured. A hand
-- `UPDATE cities SET country_id` here would move a city between countries while
-- leaving every child's gate computed against the old one.
--
-- TIMEZONE. Several rows carry a timezone belonging to the WRONG country
-- (Europe/Stockholm on Berlin, Europe/Brussels on Luxembourg City, Europe/Berlin
-- on Vienna). Every one was derived alongside the country now being corrected,
-- and not one is right for the new country. They are set to NULL rather than
-- guessed: `cities.timezone` feeds event timezone fill, so a confidently wrong
-- value propagates while a null one is honest and refillable. Same rule as the
-- prose retractions -- prefer NULL to a guess.
--
-- The id list is frozen and each row carries the from/to codes measured at
-- authoring time. A row that has since been merged, deleted, already repaired, or
-- that would now collide is SKIPPED with a notice, never forced: soft on
-- preconditions, hard on postconditions. In particular the collision guard means
-- a future name clash degrades to one skipped row instead of aborting the whole
-- migration -- and an aborted migration on `main` blocks every migration queued
-- behind it.
--
-- No explicit BEGIN/COMMIT: `db push` already wraps each migration in a
-- transaction, and an inner COMMIT would end the enclosing one, which also makes
-- the file impossible to dry-run inside a rolled-back transaction.

-- ---------------------------------------------------------------------------
-- Detector. Reports every contradiction WITH its verdict, so an abstention is
-- visible rather than filtered away.
-- ---------------------------------------------------------------------------
create or replace function public.city_country_polygon_conflicts(
  p_min_km numeric default 50
)
returns table (
  city_id uuid,
  city_name text,
  city_slug text,
  stored_code text,
  polygon_code text,
  km_to_stored numeric,
  seo_indexable boolean,
  content_rows integer,
  verdict text
)
language sql
stable
security definer
-- 'extensions' is load-bearing: PostGIS lives there, so a bare
-- `set search_path to 'public'` makes st_point/st_contains/st_distance
-- unresolvable INSIDE the function while the identical query runs fine from a
-- session with the default path. Same trap as the two-arg extensions.unaccent()
-- callers. Caught by dry run, not by reading.
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with live as (
    select c.id, c.name, c.slug, co.code stored_code,
           c.latitude, c.longitude, c.seo_indexable,
           ((select count(*) from public.venues v where v.city_id = c.id)
          + (select count(*) from public.events e where e.city_id = c.id))::integer content_rows
    from public.cities c
    join public.countries co on co.id = c.country_id
    where c.latitude is not null
      and c.longitude is not null
      and c.duplicate_of_id is null
      and coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged')
  ),
  hit as (
    select l.*, b.iso_a2 polygon_code
    from live l
    join lateral (
      select b.iso_a2, b.sovereign_iso_a2
      from public.geo_boundaries b
      where b.boundary_kind = 'country'
        and st_contains(b.geom, st_setsrid(st_point(l.longitude::float8, l.latitude::float8), 4326))
      limit 1
    ) b on true
    -- keeps a territory polygon from contradicting its own sovereign
    where b.iso_a2 <> l.stored_code
      and coalesce(b.sovereign_iso_a2, '') <> l.stored_code
  ),
  scored as (
    select h.*,
           (select count(*) from public.geo_boundaries s
             where s.boundary_kind = 'country' and s.iso_a2 = h.stored_code) stored_poly,
           (select min(st_distance(s.geom::geography,
                        st_setsrid(st_point(h.longitude::float8, h.latitude::float8), 4326)::geography)) / 1000
              from public.geo_boundaries s
             where s.boundary_kind = 'country' and s.iso_a2 = h.stored_code) km_stored,
           (select gco.name from public.countries gco where gco.code = h.polygon_code) polygon_country
    from hit h
  )
  select s.id, s.name, s.slug, s.stored_code, s.polygon_code,
         round(s.km_stored::numeric, 1),
         s.seo_indexable,
         s.content_rows,
         case
           when s.stored_poly = 0 then 'abstain_no_polygon_for_stored'
           when s.km_stored >= p_min_km then 'conflict_far'
           when s.polygon_country is not null and s.name ilike '%' || s.polygon_country
                then 'conflict_name_corroborated'
           else 'abstain_border_precision'
         end
  from scored s
  order by s.km_stored desc nulls last;
$function$;

comment on function public.city_country_polygon_conflicts(numeric) is
  'Cities whose stored country is contradicted by the geo_boundaries country polygon containing their coordinates. Complements city_country_contradictions(), which derives the country from child events and is therefore blind to content-less shells. Verdicts prefixed conflict_ are actionable; abstain_ rows are dependent territories (no polygon for the stored code) or border-precision artifacts and must NOT be auto-repaired -- all six seo_indexable contradictions measured 2026-09-13 were abstentions.';

revoke all on function public.city_country_polygon_conflicts(numeric) from public, anon, authenticated;
grant execute on function public.city_country_polygon_conflicts(numeric) to service_role;

-- ---------------------------------------------------------------------------
-- Repair. Frozen list, each row re-verified against the live polygon and against
-- the uniqueness constraint before it is touched.
-- ---------------------------------------------------------------------------
do $repair$
declare
  rec        record;
  v_to_id    uuid;
  v_live_cc  text;
  v_poly_cc  text;
  v_norm     text;
  v_res      jsonb;
  v_fixed    int := 0;
  v_skipped  int := 0;
  v_tz       int := 0;
  v_notes    text := '';
begin
  for rec in
    select * from (values
      ('0da05c6f-3205-4808-b254-9151f8001e4e'::uuid, 'Buenos Aires, Argentina',        'CL', 'AR'),
      ('606a2a48-09b1-4965-84c2-5082d91899c3'::uuid, 'Myslowice, Silesian Voivodeship','EE', 'PL'),
      ('b39554b3-dc40-4af7-8396-ec35c6f928b4'::uuid, 'Jena',                           'RO', 'DE'),
      ('b7b4b83d-2e7a-4dad-b41a-2a0424e881ab'::uuid, 'Norton',                         'CZ', 'GB'),
      ('fd0e1ced-0231-43a5-93de-054d9f24ef2c'::uuid, 'Longueau',                       'ES', 'FR'),
      ('ef53a019-c7ea-4ab6-84a8-106532c0d2ab'::uuid, 'Kolmar',                         'PL', 'FR'),
      ('383b12ea-8847-4aab-9aef-eb0ee5622d77'::uuid, 'Cologne, Germany',               'GB', 'DE'),
      ('f7fdbb53-7260-4534-9d64-7af96da9b011'::uuid, 'Bussum',                         'DK', 'NL'),
      ('39c5da51-9f98-4de7-84ca-66a85c5f3c53'::uuid, 'Berlin, Germany',                'SE', 'DE'),
      ('707e4f2f-a8ba-4051-9d28-73f73779b643'::uuid, 'Frystat',                        'DE', 'CZ'),
      ('aea7807e-b07d-40f8-b7bb-b09fe4d9c322'::uuid, 'Palmdale',                       'MX', 'US'),
      ('b3295cf8-677e-4323-ad3d-89b6e87bbbff'::uuid, 'Vienna, Austria',                'DE', 'AT'),
      ('81b4769c-72e5-4268-8b4d-0298c82ca91c'::uuid, 'Tirana, Albania',                'IT', 'AL'),
      ('ea6c04bf-1008-4218-a45b-859c3d9c9ab2'::uuid, 'Chalons-en-Champagne',           'DE', 'FR'),
      ('ebb30ebf-a789-4c84-90b8-fba6e5e68688'::uuid, 'Vufflens-le-Chateau',            'DE', 'CH'),
      ('3df7a1a5-c0af-48e3-8b2f-0475fdb51306'::uuid, 'Bruges',                         'GB', 'BE'),
      ('16e18e75-80d7-4fab-ac95-96fb63679d56'::uuid, 'Neuhausen',                      'PL', 'DE'),
      ('7025e190-9a4f-4c28-9068-780a3317cce7'::uuid, 'Oskemen',                        'RU', 'KZ'),
      ('b013ebd9-0e92-483c-af01-5316573a8277'::uuid, 'Dublin, Republic of Ireland',    'GB', 'IE'),
      ('98013123-f0f0-4360-a7cd-e406865a6137'::uuid, 'Brussels, Belgium',              'FR', 'BE'),
      ('1c601bda-d1b3-4d2d-bdcc-ce6765c2a78e'::uuid, 'Lucerne',                        'DE', 'CH'),
      ('30b721e7-2503-48d3-a271-888c78172d86'::uuid, 'Luxembourg City, Luxembourg',    'BE', 'LU'),
      ('32620926-01c0-4b93-8ede-d1eb323ccdff'::uuid, 'Antwerp, Belgium',               'NL', 'BE'),
      ('d27691fc-d3df-4144-9554-b90523c1ff4a'::uuid, 'Geneva, Switzerland',            'FR', 'CH'),
      ('20e2c3f9-e3bc-4225-a009-97eb92062b95'::uuid, 'Basel, Switzerland',             'DE', 'CH')
    ) as t(city_id, label, from_cc, to_cc)
  loop
    select co.code, c.name_normalized into v_live_cc, v_norm
      from public.cities c
      join public.countries co on co.id = c.country_id
     where c.id = rec.city_id and c.duplicate_of_id is null;

    if v_live_cc is null then
      v_skipped := v_skipped + 1;
      v_notes := v_notes || format('  skip %s: gone or merged%s', rec.label, chr(10));
      continue;
    end if;

    if v_live_cc = rec.to_cc then
      v_skipped := v_skipped + 1;
      v_notes := v_notes || format('  skip %s: already %s%s', rec.label, rec.to_cc, chr(10));
      continue;
    end if;

    if v_live_cc <> rec.from_cc then
      v_skipped := v_skipped + 1;
      v_notes := v_notes || format('  skip %s: moved to %s since authoring (expected %s)%s',
                                   rec.label, v_live_cc, rec.from_cc, chr(10));
      continue;
    end if;

    -- Re-verify against the polygon NOW rather than trusting the frozen to_cc.
    -- If geo_boundaries has been reloaded and disagrees, that is a reason to
    -- stop, not to overwrite.
    select b.iso_a2 into v_poly_cc
      from public.cities c
      join lateral (
        select b.iso_a2 from public.geo_boundaries b
        where b.boundary_kind = 'country'
          and st_contains(b.geom, st_setsrid(st_point(c.longitude::float8, c.latitude::float8), 4326))
        limit 1
      ) b on true
     where c.id = rec.city_id;

    if v_poly_cc is distinct from rec.to_cc then
      v_skipped := v_skipped + 1;
      v_notes := v_notes || format('  skip %s: polygon now says %s, expected %s%s',
                                   rec.label, coalesce(v_poly_cc, '<none>'), rec.to_cc, chr(10));
      continue;
    end if;

    select id into v_to_id from public.countries
     where code = rec.to_cc and duplicate_of_id is null;

    if v_to_id is null then
      v_skipped := v_skipped + 1;
      v_notes := v_notes || format('  skip %s: no countries row for %s%s', rec.label, rec.to_cc, chr(10));
      continue;
    end if;

    -- uk_cities_country_name_active (country_id, name_normalized)
    -- WHERE duplicate_of_id IS NULL. Skipping loudly beats a 23505 that aborts
    -- the migration and everything queued behind it.
    if exists (
      select 1 from public.cities x
       where x.country_id = v_to_id
         and x.name_normalized = v_norm
         and x.duplicate_of_id is null
         and x.id <> rec.city_id
    ) then
      v_skipped := v_skipped + 1;
      v_notes := v_notes || format('  skip %s: name collision in %s -- needs a rename or a merge%s',
                                   rec.label, rec.to_cc, chr(10));
      continue;
    end if;

    v_res := public.apply_city_country_repair(
      rec.city_id, v_to_id,
      jsonb_build_object(
        'source', 'derived:geo_boundaries_polygon',
        'from_code', rec.from_cc,
        'to_code', rec.to_cc,
        'detector', 'city_country_polygon_conflicts',
        'note', 'stored country contradicted by the country polygon containing the row''s own coordinates; invisible to city_country_contradictions() because the row has no events'
      ));

    if coalesce((v_res->>'changed')::boolean, false) then
      v_fixed := v_fixed + 1;
    else
      v_skipped := v_skipped + 1;
      v_notes := v_notes || format('  skip %s: repair returned %s%s', rec.label, v_res::text, chr(10));
      continue;
    end if;

    -- The timezone was derived alongside the country just corrected and is wrong
    -- for the new one in every measured case. NULL, never a guess.
    update public.cities
       set timezone = null,
           field_provenance = coalesce(field_provenance, '{}'::jsonb)
             || jsonb_build_object('timezone', jsonb_build_object(
                  'value', null,
                  'source', 'retracted:country_repair',
                  'previous', timezone,
                  'at', now()))
     where id = rec.city_id and timezone is not null;
    if found then v_tz := v_tz + 1; end if;
  end loop;

  raise notice 'city country polygon repair: % fixed, % skipped, % timezones retracted',
    v_fixed, v_skipped, v_tz;
  if v_notes <> '' then raise notice 'skips:%', chr(10) || v_notes; end if;
end
$repair$;

-- ---------------------------------------------------------------------------
-- Same-town-stored-twice pairs. Derived, never named: a contradicting row whose
-- coordinates land in country X and which has a same-name live twin in X, within
-- 5 km of it. The 5 km bar is what separates "one town, two rows" (0.5 / 1.6 /
-- 2.8 km) from "two different cities that share a name" (Concord, 1,164 km).
-- QUEUED, never auto-merged: these are exactly the same-name-different-place
-- hazard that has burned this corpus before, so a human decides. The keep side
-- is the row with more content, which is also the indexable one in all three.
-- ---------------------------------------------------------------------------
do $queue$
declare
  rec record;
  v_queued int := 0;
begin
  for rec in
    with live as (
      select c.id, c.name, c.name_normalized, co.code stored_cc, c.latitude, c.longitude,
             ((select count(*) from public.venues v where v.city_id = c.id)
            + (select count(*) from public.events e where e.city_id = c.id))::int content
      from public.cities c
      join public.countries co on co.id = c.country_id
      where c.latitude is not null and c.longitude is not null and c.duplicate_of_id is null
        and coalesce(c.shell_status::text, 'real') not in ('ghost', 'merged')
    ),
    contra as (
      select l.*, b.iso_a2 poly_cc
      from live l
      join lateral (
        select b.iso_a2, b.sovereign_iso_a2 from public.geo_boundaries b
        where b.boundary_kind = 'country'
          and st_contains(b.geom, st_setsrid(st_point(l.longitude::float8, l.latitude::float8), 4326))
        limit 1
      ) b on true
      where b.iso_a2 <> l.stored_cc and coalesce(b.sovereign_iso_a2, '') <> l.stored_cc
    )
    -- `public.cities t`, NOT the `live` CTE: the twin lookup must ride the unique
    -- index on (country_id, name_normalized). Joining the CTE instead forces a
    -- hash join over every live city and re-evaluates its content subqueries,
    -- which timed out the statement.
    select k.id drop_id, k.name, k.stored_cc, k.poly_cc, k.content drop_content,
           t.id twin_id,
           ((select count(*) from public.venues v where v.city_id = t.id)
          + (select count(*) from public.events e where e.city_id = t.id))::int twin_content,
           round((st_distance(st_point(k.longitude::float8, k.latitude::float8)::geography,
                              st_point(t.longitude::float8, t.latitude::float8)::geography) / 1000)::numeric, 1) km_apart
    from contra k
    join public.countries pco on pco.code = k.poly_cc and pco.duplicate_of_id is null
    join public.cities t
      on t.country_id = pco.id
     and t.name_normalized = k.name_normalized
     and t.duplicate_of_id is null
     and t.id <> k.id
     and coalesce(t.shell_status::text, 'real') not in ('ghost', 'merged')
    where t.latitude is not null and t.longitude is not null
      and st_distance(st_point(k.longitude::float8, k.latitude::float8)::geography,
                      st_point(t.longitude::float8, t.latitude::float8)::geography) <= 5000
  loop
    -- keep the row that carries content; skip a pair already open
    if exists (
      select 1 from public.dedup_review_queue
       where entity_type = 'city' and status = 'open'
         and ((keep_id = rec.twin_id and drop_id = rec.drop_id)
           or (keep_id = rec.drop_id and drop_id = rec.twin_id))
    ) then
      continue;
    end if;

    insert into public.dedup_review_queue
      (entity_type, keep_id, drop_id, cluster, confidence, reason, source, status)
    values
      ('city',
       case when rec.twin_content >= rec.drop_content then rec.twin_id else rec.drop_id end,
       case when rec.twin_content >= rec.drop_content then rec.drop_id else rec.twin_id end,
       jsonb_build_object(
         'keep', jsonb_build_object('id', case when rec.twin_content >= rec.drop_content then rec.twin_id else rec.drop_id end,
                                    'title', rec.name || ' (' || rec.poly_cc || ')'),
         'drop', jsonb_build_object('id', case when rec.twin_content >= rec.drop_content then rec.drop_id else rec.twin_id end,
                                    'title', rec.name || ' (stored ' || rec.stored_cc || ')')),
       0.90,
       -- Phrased over BOTH codes rather than naming one as "the drop": the
       -- contradicting row is kept whenever it carries more content (which is
       -- what happens for Les Trois-Ilets), so calling its country "the drop"
       -- would tell the reviewer to merge in the wrong direction.
       format('one town stored twice, %s km apart -- filed under both %s and %s, with the coordinates falling in %s. Surfaced by city_country_polygon_conflicts. NOT country-repairable: moving either row into the other''s country collides on uk_cities_country_name_active. The nightly sweep cannot propose it either, because its city arm blocks on country and these two disagree on it. Keep side holds %s content rows against %s.',
              rec.km_apart, rec.stored_cc, rec.poly_cc, rec.poly_cc,
              greatest(rec.twin_content, rec.drop_content),
              least(rec.twin_content, rec.drop_content)),
       'city_country_polygon_repair',
       -- 'open' is the only status the sweep's open-pair unique index covers, and
       -- the only one a reviewer sees. Anything else would be re-inserted as open
       -- by the next nightly run.
       'open');

    v_queued := v_queued + 1;
  end loop;

  raise notice 'same-town pairs queued for review: %', v_queued;
end
$queue$;

-- ---------------------------------------------------------------------------
-- Postconditions. Hard on the state this migration exists to reach.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_left        int;
  v_abstain_idx int;
  v_bad_tz      int;
  v_fixed       int;
  v_pairs       int;
begin
  -- 1. Nothing actionable may remain outside the recorded exclusions.
  select count(*) into v_left
    from public.city_country_polygon_conflicts(50)
   where verdict like 'conflict%'
     and city_name not in ('El Aaiun', 'El Aaiún', 'Thebes', 'Deutsch-Ostafrika',
                           'Rio Grande Valley', 'Enniskillen', 'Concord', 'Lyss');
  if v_left > 0 then
    raise exception 'city country repair incomplete: % actionable conflicts remain', v_left;
  end if;

  -- 2. The repair actually ran. Counting conflicts alone would also pass on an
  --    empty table or a detector narrowed into uselessness.
  select count(*) into v_fixed
    from public.cities
   where field_provenance -> 'country_id' ->> 'source' = 'derived:geo_boundaries_polygon';
  if v_fixed < 25 then
    raise exception 'expected 25 repaired cities, found %', v_fixed;
  end if;

  -- 3. Positive control: the abstention arms must still be doing work. If this
  --    reaches zero the detector has been widened, or the dependent-territory
  --    rows have been "fixed" -- the exact failure this migration exists to
  --    prevent.
  select count(*) into v_abstain_idx
    from public.city_country_polygon_conflicts(50)
   where verdict like 'abstain%' and seo_indexable;
  if v_abstain_idx = 0 then
    raise exception 'expected the indexable dependent-territory / border rows to still abstain, found none -- detector or data changed';
  end if;

  -- 4. Nothing repaired may still carry a timezone from its old country.
  select count(*) into v_bad_tz
    from public.cities c
   where c.field_provenance -> 'country_id' ->> 'source' = 'derived:geo_boundaries_polygon'
     and c.timezone is not null;
  if v_bad_tz > 0 then
    raise exception '% repaired cities still carry a stale timezone', v_bad_tz;
  end if;

  -- 5. The same-town pairs became reviewable work rather than a comment. Asserted
  --    because a silently-zero loop and a correctly-empty one look identical.
  select count(*) into v_pairs
    from public.dedup_review_queue
   where source = 'city_country_polygon_repair' and entity_type = 'city';
  if v_pairs < 3 then
    raise exception 'expected at least 3 same-town pairs queued, found %', v_pairs;
  end if;

  raise notice 'verify ok: % repaired, 0 actionable conflicts left, % indexable abstentions preserved, % pairs queued',
    v_fixed, v_abstain_idx, v_pairs;
end
$verify$;
