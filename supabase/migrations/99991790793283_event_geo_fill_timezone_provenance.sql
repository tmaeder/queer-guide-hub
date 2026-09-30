-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 99991790793283 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- CORRECTION TO THE LINE ABOVE, FOR THIS FILE ONLY: the reasoning was NOT lost, and
-- everything below this recovery header is the original author's. That generic
-- warning is true of a migration applied through MCP `apply_migration`, which stores
-- one element per parsed statement and drops the comments between them. This one was
-- applied as a single `execute_sql` call carrying the WHOLE FILE as one statement,
-- together with its own `schema_migrations` row, so the header round-tripped intact.
-- Left in place rather than deleted because the warning is correct for the common
-- case and a future reader of the recovery script needs it -- but a comment that
-- says the reasoning is lost, sitting directly above the reasoning, is the
-- comment-outlived-its-truth failure this repo keeps finding, so it is answered here
-- instead of contradicting the rest of the file in silence.
--
-- If you are applying a migration to prod ahead of its merge, do it that way: one
-- transaction, whole file, plus the history row at the file's own version. It costs
-- nothing, it adds no drift, and it is the difference between this file and a
-- recovered body with no explanation.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- The geo fill stamps the coordinates it derives and NOT the timezone, so nothing
-- downstream can tell a derived zone from one the source feed supplied.
--
-- WHY THIS MATTERS, measured. `run_event_geo_fill` writes two things from the linked
-- city: coordinates, which it stamps `field_provenance.latitude.source =
-- 'derived:city_centroid'`, and `timezone`, which it stamps NOTHING. When a link is
-- later quarantined as a namesake mislink the city goes away and both values stay
-- behind -- but only the coordinates can be identified afterwards as having come from
-- the city that was just refused.
--
-- The cost of that asymmetry, on prod today: 147 events are quarantined with a
-- `blocked` stamp, 24 still carry a timezone, 14 carry coordinates, and exactly
-- ONE of the 14 is provably centroid-derived while ZERO of the 24 timezones are
-- provably city-derived. 99991790714809 could therefore only repair a single
-- timezone -- tri-Pride's `Europe/London` on a Canadian festival -- and only because
-- that one contradicted its own country's tz REGION, a test that says nothing about
-- the other 23 (`America/*` on US events, which is also simply correct for a Georgia
-- event). Under-reaching was the right call, and this is what makes it unnecessary
-- next time.
--
-- WHAT CHANGES. One new stamp, written only when THIS statement is the one that sets
-- the column (`e.timezone is null`), so a zone that arrived with the event keeps its
-- own provenance and is never relabelled as derived. It records WHICH source it came
-- from, because the two rot differently: a zone taken from the linked CITY is wrong
-- the moment that link is quarantined, while a zone taken from a single-timezone
-- COUNTRY survives an unlink intact. Coordinates keep their existing stamp, byte for
-- byte.
--
-- WHAT THIS DOES NOT DO, deliberately. It does not clear anything, and it does not
-- make the quarantine path clear anything either. It is forward-looking only: rows
-- filled from today carry the evidence, and the 23 unprovable timezones already on
-- the table stay unprovable -- backfilling a stamp onto them would be asserting a
-- source this code never recorded, which is the "absence of evidence recorded as
-- evidence" failure this repo keeps finding. They remain a human work list.
--
-- Built from `pg_get_functiondef` of the LIVE function, not from the migration file,
-- and diffed against it: the only changes are the `v_tz_src` declaration, its
-- assignment, and the timezone branch of the `field_provenance` expression.

CREATE OR REPLACE FUNCTION public.run_event_geo_fill(p_batch integer DEFAULT 300, p_force boolean DEFAULT false)
 RETURNS TABLE(processed integer, coords_set integer, tz_set integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  r          record;
  v_proc     integer := 0;
  v_coords   integer := 0;
  v_tz       integer := 0;
  v_new_tz   text;
  v_tz_src   text;
  c_multizone constant text[] := array[
    'US','CA','AU','BR','RU','MX','ID','KZ','CD','CL','EC','ES','PT','FR','NZ',
    'MN','CN','GL','KI','PF','UM','AQ','PG','MH','FM','GB','NL','DK','PS'
  ];
begin
  for r in
    select e.id,
           e.latitude, e.longitude, e.timezone,
           c.latitude  as c_lat,
           c.longitude as c_lng,
           c.timezone  as c_tz,
           co.timezone as co_tz,
           co.code     as co_code
    from public.events e
    join public.cities c on c.id = e.city_id and c.duplicate_of_id is null
    left join public.countries co on co.id = e.country_id
    where e.duplicate_of_id is null
      and (e.latitude is null or e.longitude is null or e.timezone is null)
      and (
            p_force
            or not (coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_geo_fill')
            -- Re-open a visited row ONLY for a gap this pass can actually close. The
            -- UPDATE below sets latitude/longitude from the city whenever they are
            -- null and the city has them, so this arm stops matching the moment it is
            -- satisfied -- which is what bounds it without an attempts counter.
            or ((e.latitude is null or e.longitude is null)
                 and c.latitude is not null and c.longitude is not null)
            -- Same rule for the timezone, narrowed to the branch that is
            -- UNCONDITIONAL: `v_new_tz` takes `c_tz` whenever the city has one, with no
            -- reference to `c_multizone`. So this predicate needs no copy of that list
            -- and still guarantees the body closes what it selects. The country
            -- fallback IS multizone-dependent and is deliberately left out -- a
            -- predicate that claims fillable while the body computes null is the
            -- nightly loop this whole design avoids.
            or (e.timezone is null and nullif(btrim(c.timezone), '') is not null)
          )
    order by (e.start_date >= now()) desc nulls last, e.start_date desc nulls last, e.id
    limit greatest(p_batch, 1)
  loop
    v_proc := v_proc + 1;

    v_new_tz := case
      when r.timezone is not null then null
      when nullif(btrim(r.c_tz), '') is not null then r.c_tz
      when nullif(btrim(r.co_tz), '') is not null and not (r.co_code = any (c_multizone)) then r.co_tz
      else null
    end;

    -- WHICH source it came from, because the two rot differently. A zone taken from
    -- the linked CITY is wrong the moment that link is quarantined as a namesake
    -- mislink; a zone taken from a single-timezone COUNTRY survives an unlink intact.
    -- Until this stamp existed the two were indistinguishable on the row, which is
    -- why a repair could only ever prove ONE of 24 surviving timezones wrong -- the
    -- cross-continent one -- and had to leave the rest alone.
    v_tz_src := case
      when v_new_tz is null then null
      when nullif(btrim(r.c_tz), '') is not null and v_new_tz = r.c_tz then 'derived:city_timezone'
      else 'derived:country_timezone'
    end;

    if v_new_tz is not null then v_tz := v_tz + 1; end if;
    if (r.latitude is null or r.longitude is null) and r.c_lat is not null and r.c_lng is not null then
      v_coords := v_coords + 1;
    end if;

    update public.events e set
      latitude  = case when e.latitude  is null then r.c_lat else e.latitude  end,
      longitude = case when e.longitude is null then r.c_lng else e.longitude end,
      timezone  = coalesce(e.timezone, v_new_tz),
      field_provenance =
        -- Coordinates: unchanged, still stamped as a city centroid so they are never
        -- mistaken for a real venue location.
        (case
          when e.latitude is null and r.c_lat is not null then
            coalesce(e.field_provenance, '{}'::jsonb)
              || jsonb_build_object(
                   'latitude',  jsonb_build_object('value', r.c_lat, 'source', 'derived:city_centroid', 'confidence', 0.3, 'at', now()),
                   'longitude', jsonb_build_object('value', r.c_lng, 'source', 'derived:city_centroid', 'confidence', 0.3, 'at', now()))
          else coalesce(e.field_provenance, '{}'::jsonb)
        end)
        -- Timezone: NEW. Stamped only when this statement is the one that sets it
        -- (`e.timezone is null`), so an existing zone from the source feed keeps its
        -- own provenance and is never relabelled as derived.
        || (case
             when e.timezone is null and v_new_tz is not null then
               jsonb_build_object('timezone', jsonb_build_object(
                 'value', v_new_tz, 'source', v_tz_src, 'confidence', 0.3, 'at', now()))
             else '{}'::jsonb
           end),
      enrichment_status = jsonb_set(
        coalesce(e.enrichment_status, '{}'::jsonb), '{event_geo_fill}',
        jsonb_build_object('at', now()), true)
    where e.id = r.id;
  end loop;

  processed := v_proc; coords_set := v_coords; tz_set := v_tz; return next;
end;
$function$;

-- Grants are not restated: CREATE OR REPLACE preserves them, and this function was
-- already revoked from public/anon/authenticated and granted to service_role by
-- 20260801135216. Asserted below rather than assumed.

-- ---------------------------------------------------------------------------
-- SECOND, UNRELATED TO THE SEAL: 99991790714809 CLOBBERED ANOTHER SESSION'S
-- PROVENANCE, AND THAT WAS MINE.
--
-- That migration merged `at` and `by` directly into the shared
-- `enrichment_status.event_city_link` object:
--     || jsonb_build_object('stale_timezone_cleared', ..., 'at', now(), 'by', ...)
-- `event_city_link` already had an `at` and a `by` from whichever writer quarantined
-- the row, so the merge overwrote them. On tri-Pride the row now reads
-- `by: migration:99991790714809` -- i.e. it claims MY migration blocked the link,
-- when all mine did was clear a stale timezone afterwards.
--
-- The surviving twin is the evidence. CSD Burgdorf went through the same quarantine
-- and I did not touch its `event_city_link`, so it still reads
-- `at: 2026-09-29T20:44:18Z, by: migration:99991790719878`. That is the real blocker
-- for both rows.
--
-- AND THE ATTRIBUTION #4016 PUBLISHED WAS WRONG. Its header and PR body say
-- `run_event_city_link` quarantined the two events on its 03:05 cron run. It did
-- not. That cron stamps the text `same-name-city collision; source metro or state
-- contradicts cities.region_name` (121 rows, last at 2026-09-29 03:05:00); these two
-- carry `namesake_across_border`, which appears on exactly 2 rows and in NO branch
-- and NO live function in this repo. Worse, `99991790719878` is in no branch and has
-- NO `schema_migrations` row, so it reached production as raw SQL that stamped itself
-- as a migration. The self-healing cron in that story does not exist; a sibling
-- session did it by hand. Corrected here because a merged header cannot be edited and
-- a future reader would otherwise rely on a producer that never ran.
--
-- The fix moves my stamp under its own key so it can never be read as the blocker,
-- and records the attribution I destroyed rather than inventing a timestamp for it.
update public.events e
set enrichment_status = jsonb_set(
      coalesce(e.enrichment_status, '{}'::jsonb),
      '{event_city_link}',
      -- Drop the three keys 99991790714809 wrote into the shared object...
      ((e.enrichment_status->'event_city_link') - 'stale_timezone_cleared' - 'reason' - 'at' - 'by')
      -- ...re-nest them under their own key...
      || jsonb_build_object('stale_timezone', jsonb_build_object(
           'cleared', 'Europe/London',
           'reason', 'Derived from Cambridge, GB before the namesake mislink was '
                  || 'quarantined. Cleared rather than set to America/Toronto: nothing '
                  || 'on the row corroborates a zone and Canada spans six.',
           'at', (e.enrichment_status->'event_city_link'->>'at'),
           'by', 'migration:99991790714809'))
      -- ...and restore the blocker's own attribution, taken from the surviving twin
      -- rather than guessed. Only `by` is restored; the original `at` on THIS row was
      -- overwritten and is not recoverable, so it is recorded as unknown instead of
      -- being back-dated to the twin's timestamp, which would be a fabrication.
      || jsonb_build_object(
           'by', 'migration:99991790719878',
           'at_lost_to', 'migration:99991790714809',
           'attribution_note', 'This row''s original quarantine `at` was overwritten by '
                            || '99991790714809 merging into this object. `by` is restored '
                            || 'from CSD Burgdorf, which went through the same quarantine '
                            || 'untouched. 99991790719878 is in no branch and has no '
                            || 'schema_migrations row.'),
      true)
where e.id = 'e2ca4bd7-6a04-41a1-a651-245eb04d466b'::uuid
  -- Soft: no-op if someone already corrected it.
  and e.enrichment_status->'event_city_link'->>'by' = 'migration:99991790714809';

do $verify$
declare
  v_tz_src_decl int;  v_tz_stamp int;  v_coord_stamp int;
  v_grants      int;  v_blocker  text; v_nested int; v_flat int;
begin
  -- The seal exists in the LIVE function, not merely in this file.
  select count(*) into v_tz_src_decl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='run_event_geo_fill'
     and pg_get_functiondef(p.oid) like '%v_tz_src := case%';
  select count(*) into v_tz_stamp from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='run_event_geo_fill'
     and pg_get_functiondef(p.oid) like '%''source'', v_tz_src%';
  -- CONTROL: the coordinate stamp this file must NOT disturb.
  select count(*) into v_coord_stamp from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='run_event_geo_fill'
     and pg_get_functiondef(p.oid) like '%derived:city_centroid%';
  -- CONTROL: CREATE OR REPLACE must not have widened access.
  select count(*) into v_grants
    from information_schema.role_routine_grants
   where routine_schema='public' and routine_name='run_event_geo_fill'
     and grantee in ('PUBLIC','anon','authenticated');

  select e.enrichment_status->'event_city_link'->>'by' into v_blocker
    from public.events e where e.id='e2ca4bd7-6a04-41a1-a651-245eb04d466b';
  select count(*) into v_nested from public.events
   where id='e2ca4bd7-6a04-41a1-a651-245eb04d466b'
     and enrichment_status->'event_city_link'->'stale_timezone'->>'cleared'='Europe/London';
  -- The clobbering keys must be gone from the shared object.
  select count(*) into v_flat from public.events
   where id='e2ca4bd7-6a04-41a1-a651-245eb04d466b'
     and enrichment_status->'event_city_link' ? 'stale_timezone_cleared';

  if v_tz_src_decl <> 1 then raise exception 'run_event_geo_fill does not assign v_tz_src'; end if;
  if v_tz_stamp <> 1 then raise exception 'run_event_geo_fill does not stamp timezone provenance'; end if;
  if v_coord_stamp <> 1 then raise exception 'the derived:city_centroid coordinate stamp was lost'; end if;
  if v_grants <> 0 then raise exception 'run_event_geo_fill is reachable by % broad grantee(s)', v_grants; end if;
  if v_blocker is distinct from 'migration:99991790719878' then
    raise exception 'tri-Pride still attributes the block to %, not the real writer', v_blocker;
  end if;
  if v_nested <> 1 then raise exception 'the stale-timezone record was lost instead of re-nested'; end if;
  if v_flat <> 0 then raise exception 'the clobbering key is still in the shared object'; end if;

  raise notice 'timezone provenance sealed; tri-Pride attribution restored to the real writer';
end
$verify$;
;
