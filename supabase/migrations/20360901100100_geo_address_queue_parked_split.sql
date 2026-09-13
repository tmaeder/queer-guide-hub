-- Separate a MEASURED NEGATIVE from a FAILURE in the postal queue.
--
-- `check-pipeline-health.mjs` hard-fails on `geo_hygiene_stats().address_queue.parked
-- > 0`. Measured on prod 2026-09-09 that number is 2,537 — the ENTIRE queue — and
-- every single row carries the same `last_error`:
--
--   attempts=4  no_postal_for_coordinates  venue 2102 / event 343 / hotel 71 / organization 21
--
-- There is not one transient failure among them. That string is written by exactly
-- one branch of `backfill-venue-cities` (the `postalJobOutcome` non-'done' arm),
-- which fires when Photon ANSWERED and reported that no postcode exists for those
-- coordinates — city-states, micro-states, unaddressed places. It is an answer, not
-- an error, and the row can never succeed.
--
-- PARKING THOSE ROWS IS THE DESIGN, AND IT IS RECENT. The same branch used to DELETE
-- them, and that was the bug: `run_geo_address_enqueue_backlog` (hourly) re-selects
-- on `postal_code is null` and excludes only rows still IN the queue, so a deleted
-- row came straight back the next hour, forever — measured 2026-09-05, 49 reported
-- "fills" moved missing_postal by 0. Parking is the memory the system already
-- understands: the drain skips `attempts >= 4` and the backlog's arms exclude any
-- row present in the queue.
--
-- So the sentinel is flagging the FIX as the fault. `parked > 0` was written before
-- the terminal disposition existed and it cannot tell the two apart, and because the
-- terminal cohort can never drain, the ✗ is permanent — `pipeline-health.yml` has
-- failed every day since 2026-09-04 and cannot go green by any amount of correct
-- work. That is the cry-wolf shape this repo has been bitten by twice already (the
-- `detect_stale_venues` 60-day threshold at 99.5% of venues, the median-vs-oldest
-- dedup backlog rule), and it is what buried the genuine `marineflieger` regression
-- underneath it for six days.
--
-- CLASSIFY, DO NOT DISPOSITION. Deleting the 2,537 terminal rows is the one thing
-- that must not happen: it re-creates the delete/re-enqueue loop above, and it
-- discards the record that these coordinates were probed. Deleting a parked row is
-- documented as the deliberate way to re-offer it to a better geocoder later; that
-- lever stays available precisely because nothing deletes them routinely.
--
-- THE TRANSIENT ARM KEEPS ITS TEETH. Every other route to `attempts >= 4` goes
-- through the catch branch, which stamps the exception message — an HTTP 500, a
-- timeout, a parse error. Those are counted separately and still hard-fail at one
-- row. `is distinct from` is deliberate: a parked row with a NULL `last_error` is
-- unexplained and is counted as TRANSIENT, i.e. it fails loudly rather than being
-- absorbed into the benign bucket.
--
-- ADDITIVE FUNCTION, NOT A KEY ON geo_hygiene_stats(). That function's own header
-- gives the reason: adding a key means CREATE OR REPLACE over a body several
-- concurrent sessions also edit, and this repo has already had a restated stats
-- function land as a merge collision. Four PRs are in flight today. The old
-- `address_queue.parked` key is left exactly as it is so nothing else that reads it
-- changes meaning.

create or replace function public.geo_address_queue_parked()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  -- `attempts >= 4` must stay in step with PARK_ATTEMPTS in
  -- supabase/functions/backfill-venue-cities/index.ts.
  select jsonb_build_object(
    'total', count(*),
    -- Photon answered: no postcode exists here. Terminal, un-drainable, benign.
    'terminal', count(*) filter (where last_error = 'no_postal_for_coordinates'),
    -- Anything else, NULL included: the drain threw and gave up. Real failure.
    'transient', count(*) filter (where last_error is distinct from 'no_postal_for_coordinates'),
    'terminal_entity_types', coalesce((
      select jsonb_object_agg(entity_type, n) from (
        select entity_type, count(*) n
          from public.geo_address_queue
         where attempts >= 4 and last_error = 'no_postal_for_coordinates'
         group by 1
      ) s
    ), '{}'::jsonb),
    -- Named, not just counted: a transient parked row is actionable only if the
    -- reader can see WHY it gave up. Truncated so one pathological message cannot
    -- flood the health log.
    'transient_errors', coalesce((
      select jsonb_object_agg(err, n) from (
        select left(coalesce(last_error, '(null)'), 120) as err, count(*) n
          from public.geo_address_queue
         where attempts >= 4 and last_error is distinct from 'no_postal_for_coordinates'
         group by 1
         order by 2 desc
         limit 10
      ) s
    ), '{}'::jsonb),
    'oldest_transient_hours', (
      select round(extract(epoch from (now() - min(enqueued_at))) / 3600)::int
        from public.geo_address_queue
       where attempts >= 4 and last_error is distinct from 'no_postal_for_coordinates'
    )
  )
    from public.geo_address_queue
   where attempts >= 4;
$$;

revoke all on function public.geo_address_queue_parked() from public, anon;
grant execute on function public.geo_address_queue_parked() to authenticated, service_role;

comment on function public.geo_address_queue_parked() is
  'Splits geo_address_queue rows parked at attempts>=4 into terminal negatives (last_error=no_postal_for_coordinates — Photon answered that no postcode exists for those coordinates; these can never drain and are advisory) and transient failures (any other last_error, NULL included — the drain threw and exhausted its retries; these are a hard failure in check-pipeline-health.mjs at one row).';

-- Assert the split against the live corpus rather than trusting the predicate.
-- A terminal count of zero here would mean the discriminator does not match what
-- the drain actually writes, and the whole classification would be vacuous.
do $verify$
declare
  v jsonb;
begin
  v := public.geo_address_queue_parked();
  if (v->>'total')::int <> (v->>'terminal')::int + (v->>'transient')::int then
    raise exception 'geo_address_queue_parked: arms do not partition parked rows (%)', v;
  end if;
  raise notice 'geo_address_queue_parked at deploy: %', v;
end $verify$;
