-- Geographic correctness: Derby, England -- and why its two siblings CANNOT be created.
--
-- 99970901120000 (#3791) unlinked two events from US namesake city rows and named the
-- follow-up it deliberately did not do: "Creating College Park, Georgia and Derby,
-- England city rows -- the two unlinked events wait on those". This file completes
-- ONE of those two and establishes that the other is not completable as written.
--
-- WHAT WAS ATTEMPTED AND REFUSED BY THE DATABASE. The plan was the corpus's own
-- apparent convention -- `Dearborn, Michigan`, `Hickory, North Carolina` and
-- `Hudson, Wisconsin` are all live rows, so a comma-qualified name looked like the
-- established way to hold a same-name US city. The dry run rejected it:
--
--   ERROR 23505 idx_cities_name_country_unique
--   Key (lower(name), country_id)=(college park, 0ba25df5-...) already exists.
--
-- The key evaluated to `college park`, NOT `college park, georgia`. `cities` carries a
-- BEFORE trigger `trg_cities_aa_split_name` -> cities_split_qualified_name(), which
-- splits a qualified name into base + qualifier, stamps the original into
-- field_provenance.name, moves an unambiguous qualifier into region_name and
-- recomputes name_normalized. So the qualifier never reaches the unique index, and the
-- comma-qualified rows in the corpus are LEGACY that predates that trigger. The
-- convention is not merely unfashionable, it is actively prevented -- and the trigger
-- is right to prevent it, because two rows differing only by a qualifier is exactly the
-- duplicate class this repo keeps having to clean up.
--
-- Together with the three unique indexes on the table --
--   idx_cities_name_country_unique     (lower(name), country_id)
--   uk_cities_country_name_active      (country_id, name_normalized) WHERE not merged
--   cities_country_canonical_key_uniq  (country_id, canonical_key)
-- -- `cities` structurally holds at most ONE row per (name, country). That is
-- CLAUDE.md's "cities cannot represent same-name collisions" as an actual constraint
-- rather than an observation, and it is the real reason those rows were missing.
--
-- SO THE SCOREBOARD IS HONEST RATHER THAN COMPLETE:
--   Derby, England        -> CREATED. GB is a different country from the existing
--                            Derby (Connecticut, Q755197), so the key is satisfied.
--                            Its event is linked here.
--   College Park, Georgia -> NOT CREATABLE. `College Park` in US is taken by the
--                            Maryland row, which correctly holds its own 2014 event.
--   Roseville, Minnesota  -> NOT CREATABLE. `Roseville` in US is taken by the
--                            California row.
-- Representing those two needs the region in the uniqueness key, which is a schema
-- change across ~5,700 rows and every geo surface -- deliberately not smuggled in here.
-- DO NOT work around it by inventing a parenthesised or otherwise mangled name: that
-- re-creates the duplicate the split trigger exists to stop, under a spelling no
-- resolver will ever match.
--
-- THE IDENTIFIER WAS RESOLVED LIVE AND CORROBORATED, never recalled -- CLAUDE.md
-- records a QID recalled as "the correct Kowloon" that was a family of
-- microcontrollers. Q43475 "City in Derbyshire, England", 52.9247 / -1.478, which is
-- 0.4 km from the event's own coordinates; the control is that the same event sits
-- 6,649.4 km from College Park, Georgia, so no row could have taken the other's content.
--
-- The two rows that stay unrepresented keep the treatment 20260802090844 established
-- and 99970901120000 applied: BLOCK rather than guess, because a null city_id is
-- recoverable and a wrong one is not. The College Park event is already unlinked and
-- flagged. The two Roseville venues are unlinked here for the same reason -- they are
-- a Minnesota salon and pizzeria (state='Minnesota', both 1.7 km from Q983979)
-- currently presented on a California city row, which is a wrong-place claim.
--
-- venues.state ALONE DID NOT DECIDE THAT AND COULD NOT. Measured across this cohort
-- the column is near-random: "Quest" in Taos says Alabama, "Amtrak Raton" (New Mexico)
-- says California, "Custer Beacon" says "Santa Fe" which is not a state, Colon Duty
-- Free (PANAMA) says Michigan, the 250 Main Hotel in Rockland MAINE says British
-- Columbia. The two Roseville venues are actionable only because their COORDINATES
-- independently corroborate the text, so the predicate requires both.
--
-- THE DERBY ROW MAY ALREADY EXIST ON PROD, AND THAT IS MY DOING, RECORDED RATHER THAN
-- TIDIED AWAY. While diagnosing the 23505 above I ran the candidate INSERT through
-- `execute_sql` to read back what the triggers did to name_normalized, and did NOT wrap
-- it in a forced rollback -- a successful call commits. It inserted Derby (no conflict)
-- and silently skipped the two that collided, which is also how the constraint was
-- found. The committed row is correct -- Q43475, 52.9247/-1.478, GB, deindexed -- so it
-- is kept rather than deleted and re-created for tidiness. The insert below is
-- therefore a no-op against prod and creates the row on a rebuild from zero; the
-- postconditions assert the END STATE rather than counting insertions, which is what
-- makes the file correct in both worlds. The lesson is the plain one: a diagnostic
-- query against prod is a WRITE unless it is forced to roll back.
--
-- Soft on preconditions, hard on postconditions: every write is guarded on the defect,
-- so a concurrent repair is skipped rather than aborting `db push` repo-wide.

begin;

-- ---------------------------------------------------------------------------
-- 1. Derby, England. seo_indexable false EXPLICITLY: a new row has no description,
--    and run_city_completeness_recompute promotes it once it holds real content,
--    which it does by the end of this migration. Publishing a blank page to crawlers
--    and waiting for the engine to catch up is the wrong direction to be wrong in.
--    The slug is supplied explicitly because the derived `derby` is already taken.
-- ---------------------------------------------------------------------------
insert into public.cities
  (name, slug, country_id, region_name, latitude, longitude,
   wikidata_qid, data_source, seo_indexable, field_provenance)
values
  ('Derby', 'derby-england',
   '58581332-7745-430b-8b51-dd1537e85cf0', 'England',
   52.9247, -1.478, 'Q43475', 'wikidata', false,
   jsonb_build_object('latitude', jsonb_build_object(
     'by', 'migration:99991789838472',
     'source', 'wikidata:Q43475',
     'reason', 'namesake_collision_resolved_new_country_row')))
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Link the Derby event 99970901120000 blocked.
-- ---------------------------------------------------------------------------
update public.events e
   set city_id = c.id,
       needs_attention = false,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_city_link', jsonb_build_object(
              'by', 'migration:99991789838472',
              'linked', true,
              'reason', 'namesake_collision_resolved',
              'detail', 'Derby, England created from wikidata Q43475 and corroborated at 0.4 km against the event''s own coordinates'))
  from public.cities c
 where c.slug = 'derby-england'
   and e.postal_code = 'DE1 1LH'
   and e.city_id is null
   and e.enrichment_status->'event_city_link'->>'by' = 'migration:99970901120000';

-- ---------------------------------------------------------------------------
-- 3. Unlink the two Minnesota venues from the California Roseville row. Both signals
--    required -- the state text AND a coordinate within 25 km of Q983979 -- so either
--    one alone is declined. The two Californian venues on the same row are untouched.
-- ---------------------------------------------------------------------------
update public.venues v
   set city_id = null,
       needs_attention = true,
       enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('venue_city_link', jsonb_build_object(
              'by', 'migration:99991789838472',
              'blocked', true,
              'reason', 'name_only_namesake_collision',
              'detail', 'venue is in Roseville, Minnesota (Q983979, 1.7 km); it was linked to the Roseville, California row. Roseville, Minnesota cannot be created: cities is unique on (name, country) and the split-name trigger removes a qualifier.'))
  from public.cities ca
 where ca.slug = 'tmp-a7a9173f-64e0-444e-b26d-ca4338285fb1'
   and v.city_id = ca.id
   and v.duplicate_of_id is null
   and lower(v.state) = 'minnesota'
   and v.latitude is not null
   and haversine_m(v.latitude, v.longitude, 45.01527778::numeric, -93.15305556::numeric) < 25000;

do $verify$
declare
  v_bad int;
  v_db uuid;
begin
  -- P1: Derby, England exists with the resolved identifier, country and coordinates.
  select count(*) into v_bad
  from public.cities c join public.countries co on co.id = c.country_id
  where c.slug = 'derby-england' and c.wikidata_qid = 'Q43475' and co.code = 'GB'
    and c.duplicate_of_id is null
    and haversine_m(c.latitude, c.longitude, 52.9247::numeric, -1.478::numeric) < 1000;
  if v_bad <> 1 then
    raise exception 'P1 failed: Derby, England missing or not matching its resolved identifier/coordinates (found %)', v_bad;
  end if;
  select id into v_db from public.cities where slug = 'derby-england';

  -- P2: the Derby event is linked, un-flagged and near its new city.
  select count(*) into v_bad from public.events e
  where e.postal_code = 'DE1 1LH'
    and (e.city_id is distinct from v_db or e.needs_attention
         or haversine_m(e.latitude, e.longitude, 52.9247::numeric, -1.478::numeric) > 25000);
  if v_bad <> 0 then
    raise exception 'P2 failed: the Derby event is still unlinked, still flagged, or far from Derby (% row(s))', v_bad;
  end if;

  -- P3: both Minnesota venues are unlinked and flagged.
  select count(*) into v_bad from public.venues v
  where lower(v.state) = 'minnesota' and v.duplicate_of_id is null
    and v.latitude is not null
    and haversine_m(v.latitude, v.longitude, 45.01527778::numeric, -93.15305556::numeric) < 25000
    and v.enrichment_status->'venue_city_link'->>'by' = 'migration:99991789838472'
    and (v.city_id is not null or not v.needs_attention);
  if v_bad <> 0 then
    raise exception 'P3 failed: % Minnesota venue(s) still linked or unflagged', v_bad;
  end if;

  -- P4 MIRROR: the two Californian venues STAYED on the California row. "The Minnesota
  -- pair was unlinked" is equally satisfied by a sweep that emptied the row entirely.
  select count(*) into v_bad from public.venues v
  join public.cities ca on ca.id = v.city_id
  where ca.slug = 'tmp-a7a9173f-64e0-444e-b26d-ca4338285fb1' and v.duplicate_of_id is null;
  if v_bad <> 2 then
    raise exception 'P4 failed: expected the 2 Californian venues to remain on the California Roseville row, found %', v_bad;
  end if;

  -- P5 MIRROR: the rows this file must NOT touch are intact. College Park, Maryland
  -- keeps its correctly-placed event; Derby, Connecticut keeps its venues and its slug.
  select count(*) into v_bad from public.events e
  join public.cities c on c.id = e.city_id
  where c.slug = 'tmp-23a52220-16e4-4622-b06d-c13d86ccd4e8';
  if v_bad <> 1 then
    raise exception 'P5 failed: College Park, Maryland should still hold its 1 event, holds %', v_bad;
  end if;

  select count(*) into v_bad from public.venues v
  join public.cities c on c.id = v.city_id
  where c.slug = 'derby' and c.wikidata_qid = 'Q755197' and v.duplicate_of_id is null;
  if v_bad <> 4 then
    raise exception 'P5 failed: Derby, Connecticut should still hold its 4 venues, holds %', v_bad;
  end if;

  -- P6: the College Park event stays BLOCKED, deliberately. Its city cannot exist, so
  -- a later pass that "resolves" it has either changed the schema or invented a
  -- mangled name -- both of which should break this check and be read, not skipped.
  select count(*) into v_bad from public.events e
  where e.postal_code = '30337' and e.city_id is not null;
  if v_bad <> 0 then
    raise exception 'P6 failed: the College Park, Georgia event is linked to a city; it has no representable city (% row(s))', v_bad;
  end if;

  raise notice 'geo namesake: Derby England created + 1 event linked, 2 Minnesota venues unlinked, all mirrors intact';
end
$verify$;

commit;
