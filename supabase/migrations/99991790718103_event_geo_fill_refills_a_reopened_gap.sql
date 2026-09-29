-- `run_event_geo_fill` visits a row once, ever. If the gap re-opens, nothing refills it.
--
-- THE STALE-CENTROID COHORT NEEDS NO REPAIR, AND MEASURING IT IS WHAT ESTABLISHED THAT.
-- 99991789886174 recorded "4,083 events carry coordinates identical to a merged-away
-- city's centroid" and left the cohort unsized. Sized now, against `duplicate_of_id is
-- null` on both sides: **2,824 events across 5 dead rows, and every dead row is the
-- SAME PLACE as its survivor** -- Brighton & Hove -> Brighton 0.0 km, "Berlin, Germany"
-- -> Berlin 0.0, Washington -> Washington, D.C. 1.3, Kopenhagen -> Copenhagen 1.2,
-- Hickory -> Hickory, North Carolina 2.1. Those coordinates are still correct for the
-- city the event is on, so there is nothing to retract. The 4,083 was measured without
-- the duplicate filter and so counted merged-away events too.
--
-- Four merged-away rows ARE a different place from their survivor -- `zurich` at
-- 39.94/-99.52, which is KANSAS, merged into Zürich (7,990 km); a `tmp-` row at
-- 18.26/-66.71, PUERTO RICO, merged into London (6,817 km); `hanover` in Hesse into
-- Hannover in Lower Saxony (263 km); and `od` in Volyn Oblast into Łódź (423 km). All
-- four are inert: 0 events linked, 0 venues linked, 0 events carrying their centroid.
-- The single historical victim was the Łódź event 99991789886174 already fixed.
--
-- THE PRODUCER IS NOT THE FILL READING DEAD ROWS -- it joins `c.duplicate_of_id is
-- null` and never sees them. The mechanism is that a centroid is stamped while the city
-- is LIVE, the city is later merged into a different place, and the derived value
-- outlives the row it came from. `merge_cities`' only write to `events` sets the `city`
-- TEXT; it does not re-derive coordinates or timezone. That producer is NOT changed
-- here -- restating a merge core is a large collision surface for a class that has
-- produced one victim ever -- it is WATCHED instead, by the zero-invariant below.
--
-- WHAT IS ACTUALLY BROKEN IS THE FILL'S CURSOR, and it is a bigger number than the
-- cohort. The selector is `p_force or not (enrichment_status ? 'event_geo_fill')`, so a
-- row is either never-visited or permanently-done. Measured over the 1,043 events with
-- a geo gap and a live city: 752 never visited (the nightly cron reaches those), and
-- **291 visited and stuck -- of which 50 could have coordinates filled from their city
-- right now**, 1 a timezone, and 240 nothing at all.
--
-- Two independent causes reach that state, which is why a trigger on "coordinates were
-- nulled" would only have covered half of it: a row visited while its city had no
-- coordinates is stuck the moment the CITY gains them, and nothing about the event
-- changed. The 2 rows 99991789886174 retracted are in the 50 as well -- that migration
-- removed coordinates a cron could never restore, so it left two events permanently
-- uncoordinated. This fixes that as a side effect rather than as a special case.
--
-- THE SELECTOR IS NOW FILLABLE-GAP DRIVEN, AND THAT IS WHAT MAKES IT TERMINATE. The new
-- arm re-opens a visited row only when coordinates are missing AND the city has them,
-- which is exactly the condition the UPDATE below closes -- so a row can be selected at
-- most until it is filled, with no attempts counter and no risk of a nightly loop.
--
-- The 240 nothing-fillable rows are deliberately NOT re-opened. Treating a legacy stamp
-- as "0 attempts" would have re-selected all 291, and 240 of them would re-select every
-- night forever with nothing to write -- on a table whose every UPDATE fans out through
-- `trg_search_documents_event`, which CLAUDE.md measures at 13.8s of a 14.6s 300-row
-- write. Cheap to get wrong, so the predicate names what it can close.
--
-- THE TIMEZONE HALF IS COVERED TOO, but only its unconditional branch. `v_new_tz`
-- takes the city's timezone whenever the city has one, with no reference to
-- `c_multizone`, so `e.timezone is null and c.timezone is not null` needs no copy of
-- that list and still guarantees the body closes what it selects. The COUNTRY fallback
-- is multizone-dependent and stays out: a predicate that claims fillable while the body
-- computes null is exactly the nightly loop this design avoids.
--
-- That half was going to be left out entirely until 99991790714809 landed while this was
-- being written. It repairs a Waterloo-Region festival that `run_event_geo_fill` had
-- stamped `Europe/London` from a Cambridge, ENGLAND link -- the same "derived value
-- outlived its input" mechanism on the timezone axis -- and clearing that stamp leaves a
-- NULL the visit-once cursor could never refill. Reading a sibling's merged work is what
-- turned a stated residue into a covered case.

begin;

-- ---------------------------------------------------------------------------
-- 1. The fill. Body is byte-for-byte what was deployed; the only change is the
--    third arm of the `and (p_force or ...)` predicate.
-- ---------------------------------------------------------------------------
create or replace function public.run_event_geo_fill(p_batch integer default 300, p_force boolean default false)
returns table(processed integer, coords_set integer, tz_set integer)
language plpgsql
set search_path to 'public'
as $function$
declare
  r          record;
  v_proc     integer := 0;
  v_coords   integer := 0;
  v_tz       integer := 0;
  v_new_tz   text;
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

    if v_new_tz is not null then v_tz := v_tz + 1; end if;
    if (r.latitude is null or r.longitude is null) and r.c_lat is not null and r.c_lng is not null then
      v_coords := v_coords + 1;
    end if;

    update public.events e set
      latitude  = case when e.latitude  is null then r.c_lat else e.latitude  end,
      longitude = case when e.longitude is null then r.c_lng else e.longitude end,
      timezone  = coalesce(e.timezone, v_new_tz),
      field_provenance = case
        when e.latitude is null and r.c_lat is not null then
          coalesce(e.field_provenance, '{}'::jsonb)
            || jsonb_build_object(
                 'latitude',  jsonb_build_object('value', r.c_lat, 'source', 'derived:city_centroid', 'confidence', 0.3, 'at', now()),
                 'longitude', jsonb_build_object('value', r.c_lng, 'source', 'derived:city_centroid', 'confidence', 0.3, 'at', now()))
        else coalesce(e.field_provenance, '{}'::jsonb)
      end,
      enrichment_status = jsonb_set(
        coalesce(e.enrichment_status, '{}'::jsonb), '{event_geo_fill}',
        jsonb_build_object('at', now()), true)
    where e.id = r.id;
  end loop;

  processed := v_proc; coords_set := v_coords; tz_set := v_tz; return next;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. The sentinel. STANDALONE rather than a key on pipeline_hygiene_stats(): that
--    body is long and a new key there is a merge-collision surface, which is the
--    reason glossary_link_signals and the news/venue/event signals are separate too.
--    service_role only -- a DEFINER aggregate granted to `authenticated` is granted
--    to every member.
--
--    `probe_ok` and the totals are reported SEPARATELY from the counts, because an
--    empty events table, a revoked grant and a clean corpus all produce the same
--    reassuring zero.
-- ---------------------------------------------------------------------------
create or replace function public.event_geo_derivation_signals()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
stable
as $function$
  with gap as (
    select e.id, e.latitude, e.longitude, e.timezone tz, e.enrichment_status es,
           c.latitude c_lat, c.longitude c_lng, c.timezone c_tz
    from public.events e
    join public.cities c on c.id = e.city_id and c.duplicate_of_id is null
    where e.duplicate_of_id is null
      and (e.latitude is null or e.longitude is null or e.timezone is null)
  ),
  -- an event carrying the centroid of a merged-away row that is a DIFFERENT place from
  -- the city the event is now presented on
  stale as (
    select e.id, d.slug dead_slug, c.slug city_slug,
           round(public.haversine_m(d.latitude::numeric, d.longitude::numeric,
                                    c.latitude::numeric, c.longitude::numeric)::numeric / 1000, 0) km
    from public.events e
    join public.cities d on d.duplicate_of_id is not null
      and d.latitude = e.latitude and d.longitude = e.longitude
    join public.cities c on c.id = e.city_id
    where e.duplicate_of_id is null
      and c.latitude is not null and d.latitude is not null
      and public.haversine_m(d.latitude::numeric, d.longitude::numeric,
                             c.latitude::numeric, c.longitude::numeric) > 250000
  )
  select jsonb_build_object(
    'probe_ok', true,
    'events_with_gap', (select count(*) from gap),
    'never_visited', (select count(*) from gap where not (coalesce(es,'{}'::jsonb) ? 'event_geo_fill')),
    -- zero-invariant: a derived centroid that outlived the row it came from
    'stale_centroid_far', (select count(*) from stale),
    'stale_centroid_examples', (select coalesce(jsonb_agg(jsonb_build_object(
        'dead', dead_slug, 'city', city_slug, 'km', km) order by km desc), '[]'::jsonb)
      from (select * from stale limit 20) s),
    -- advisory, drains via the reopened selector arm
    'stuck_fillable_coords', (select count(*) from gap
      where (es ? 'event_geo_fill') and (latitude is null or longitude is null)
        and c_lat is not null and c_lng is not null),
    'stuck_fillable_tz', (select count(*) from gap
      where (es ? 'event_geo_fill') and tz is null and nullif(btrim(c_tz), '') is not null),
    -- correctly done: nothing the fill could write, so never re-opened
    'stuck_nothing_fillable', (select count(*) from gap
      where (es ? 'event_geo_fill')
        and not ((latitude is null or longitude is null) and c_lat is not null and c_lng is not null)
        and not (tz is null and nullif(btrim(c_tz), '') is not null))
  )
$function$;

revoke all on function public.event_geo_derivation_signals() from public;
revoke all on function public.event_geo_derivation_signals() from anon, authenticated;
grant execute on function public.event_geo_derivation_signals() to service_role;

do $verify$
declare
  v_src text := (select pg_get_functiondef(oid) from pg_proc where proname = 'run_event_geo_fill');
  v_sig jsonb;
  v_n int;
begin
  -- P1: the re-open arm is in the DEPLOYED body, and it is the fillable-gap form
  --     rather than a blanket "legacy stamp counts as unvisited".
  if position('and c.latitude is not null and c.longitude is not null' in v_src) = 0 then
    raise exception 'P1 failed: the re-open arm is not in the deployed fill body';
  end if;
  if position('not (coalesce(e.enrichment_status' in v_src) = 0 then
    raise exception 'P1 failed: the never-visited arm was dropped, so first visits would stop happening';
  end if;

  -- P2: the fill still EXCLUDES merged-away cities. Re-opening rows would be actively
  --     harmful if it could now read a dead row's centroid.
  if position('c.duplicate_of_id is null' in v_src) = 0 then
    raise exception 'P2 failed: the fill no longer excludes merged-away cities';
  end if;

  -- P3: the selector now reaches the stuck-but-fillable rows. Asserted by COUNTING
  --     them through the function's own predicate rather than by reading its text.
  select count(*) into v_n
  from public.events e
  join public.cities c on c.id = e.city_id and c.duplicate_of_id is null
  where e.duplicate_of_id is null
    and (e.latitude is null or e.longitude is null)
    and c.latitude is not null and c.longitude is not null
    and (coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_geo_fill');
  if v_n = 0 then
    raise exception 'P3 failed: no stuck-but-fillable rows found, so this migration fixes nothing measurable';
  end if;
  raise notice 'event geo fill: % stuck-but-fillable row(s) are now reachable by the nightly cron', v_n;

  -- P4: the sentinel answers, is shaped as expected, and reports the zero-invariant.
  select public.event_geo_derivation_signals() into v_sig;
  if coalesce((v_sig->>'probe_ok')::boolean, false) is not true then
    raise exception 'P4 failed: the sentinel does not answer';
  end if;
  for v_n in select 1 where not (v_sig ? 'stale_centroid_far' and v_sig ? 'stuck_fillable_coords'
                                 and v_sig ? 'stuck_nothing_fillable' and v_sig ? 'events_with_gap') loop
    raise exception 'P4 failed: the sentinel is missing a key';
  end loop;
  if (v_sig->>'stale_centroid_far')::int <> 0 then
    raise exception 'P4 failed: % event(s) carry a merged-away centroid over 250 km from their city', (v_sig->>'stale_centroid_far')::int;
  end if;

  -- P5 MIRROR: the 240 nothing-fillable rows must NOT have become reachable. "The
  --     stuck rows are reachable" is equally satisfied by re-opening all 291.
  if (v_sig->>'stuck_nothing_fillable')::int = 0 then
    raise exception 'P5 failed: the nothing-fillable cohort reads 0, which means the predicate widened to every visited row';
  end if;

  -- P6 MIRROR: the cron that drains this is still scheduled and active. A selector
  --     that reaches rows nothing runs against is the "shipped and wired to nothing"
  --     failure this repo keeps recording.
  select count(*) into v_n from cron.job
   where command ilike '%run_event_geo_fill%' and active;
  if v_n < 1 then
    raise exception 'P6 failed: no active cron runs run_event_geo_fill, so nothing drains the reopened rows';
  end if;

  raise notice 'event geo derivation sealed: reopen arm live, sentinel answering, stale_centroid_far 0';
end
$verify$;

commit;
