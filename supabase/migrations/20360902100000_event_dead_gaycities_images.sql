-- Strip the dead gaycities S3 image urls out of events.images.
--
-- gaycities-featured-images-production.s3.amazonaws.com lost its public-read
-- policy around 2026-09 and now answers 403 AccessDenied for EVERY key --
-- verified against a deliberately bogus key, and under both a gaycities Referer
-- and a desktop UA. So this is not per-object expiry and not hotlink
-- protection: nothing in that bucket can ever load again, and a dead url is
-- worse than none (an absent image degrades to the on-brand fallback, a dead
-- one renders Chrome's torn-page glyph).
--
-- Measured on prod 2026-09-09: 27,494 events, and EVERY ONE of them has an
-- images array of exactly one element which is the dead url (keeps_an_image=0,
-- max_array_len=1). 27,493 of the 27,494 are past events -- this is the Wayback
-- import. Wayback holds none of the images either: a CDX probe of the sm_/medsq_/
-- lg_/orig_ variants returns [] while /countries/t/cover/* returns real captures,
-- so the empty result is evidence rather than a broken query. There is nothing
-- to re-source, and clearing is the fix.
--
-- The PRODUCER is sealed in the scraper, not here: gaycities moved to
-- gaycities-lv.b-cdn.net (64 of our events already carry it), so the weekly sync
-- cannot regrow this. What could is gaycities-backfill.ts reading Wayback
-- snapshots, and a migration runs once -- see DEAD_IMAGE_HOSTS in
-- scraper/src/sources/gaycities/lib.ts.
--
-- This migration ARMS AND PROVES; it does not drain. See the note above the
-- one-batch proof for why.

-- ---------------------------------------------------------------------------
-- 1. Measurement. NOTICE, not EXCEPTION: this is the state of the corpus at
--    apply time, recorded in the db push log. The extra surfaces are all 0
--    today and are REPORTED, NEVER REPAIRED -- acting on a number nobody has
--    read is how scope grows silently.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rows int; v_keep int; v_empty int; v_maxlen int;
  v_logo int; v_venue_img int; v_venue_logo int;
begin
  select count(*),
         count(*) filter (where (select count(*) from unnest(images) i
                                  where i not like '%gaycities-featured-images-production.s3%') > 0),
         count(*) filter (where (select count(*) from unnest(images) i
                                  where i not like '%gaycities-featured-images-production.s3%') = 0),
         coalesce(max(cardinality(images)), 0)
    into v_rows, v_keep, v_empty, v_maxlen
    from public.events
   where exists (select 1 from unnest(images) i
                  where i like '%gaycities-featured-images-production.s3%');

  select count(*) into v_logo from public.events
   where logo_url like '%gaycities-featured-images-production.s3%';
  select count(*) into v_venue_img from public.venues
   where exists (select 1 from unnest(images) i
                  where i like '%gaycities-featured-images-production.s3%');
  select count(*) into v_venue_logo from public.venues
   where logo_url like '%gaycities-featured-images-production.s3%';

  raise notice 'dead_gaycities_images: events=% keeps_an_image=% goes_empty=% max_array_len=%',
    v_rows, v_keep, v_empty, v_maxlen;
  raise notice 'dead_gaycities_images (reported, not repaired): events.logo_url=% venues.images=% venues.logo_url=%',
    v_logo, v_venue_img, v_venue_logo;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The runner.
-- ---------------------------------------------------------------------------
create or replace function public.run_event_dead_image_strip(p_batch int default 300)
returns jsonb
language plpgsql
security invoker                 -- NOT definer. This reads and writes events
set search_path to 'public'      -- broadly; a definer here is the reflex that
as $fn$                          -- leaked safety-gated rows to anon once already.
declare
  v_batch int;
  v_updated int;
  v_remaining int;
begin
  -- Clamped, not merely documented. events' search trigger is UNSCOPED
  -- (`after insert or update or delete`, no `update of` list, 20260531155351:166)
  -- so every row update enqueues a reindex. A caller must not be able to opt out
  -- of the cap by argument.
  v_batch := least(greatest(coalesce(p_batch, 300), 1), 300);

  with b as (
    select id from public.events
     where exists (select 1 from unnest(images) i
                    where i like '%gaycities-featured-images-production.s3%')
     limit v_batch
  )
  update public.events e
     -- A filtered rebuild, not `images = '{}'`, and not array_remove (which
     -- matches elements exactly while this match is a LIKE). Every affected row
     -- today is a single dead element so the two would agree -- but the sync cron
     -- runs weekly and the cohort is not frozen. If a mixed array ever appears,
     -- this preserves the survivor and '{}' would destroy it. Same cost.
     set images = array(select i from unnest(e.images) i
                         where i not like '%gaycities-featured-images-production.s3%')
    from b where e.id = b.id;
  get diagnostics v_updated = row_count;

  -- No cursor column is needed: stripping the url removes the row from this
  -- function's own predicate, so the work list shrinks monotonically, the job
  -- is self-terminating, and a re-run is idempotent.
  select count(*) into v_remaining from public.events
   where exists (select 1 from unnest(images) i
                  where i like '%gaycities-featured-images-production.s3%');

  return jsonb_build_object('batch', v_batch, 'updated', v_updated, 'remaining', v_remaining);
end $fn$;

comment on function public.run_event_dead_image_strip(int) is
  'Strips dead gaycities-featured-images S3 urls from events.images, <=300 rows '
  'per call (clamped in-body). Self-terminating: the predicate is the cursor. '
  'Drained by scripts/data-quality/strip-dead-gaycities-images.mjs.';

revoke all on function public.run_event_dead_image_strip(int) from public, anon, authenticated;
grant execute on function public.run_event_dead_image_strip(int) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Prove it on real data -- ONE batch, then stop.
--
--    Why not drain all 27,494 here: a 300-row batch measured 0.40s in a
--    ROLLED-BACK transaction, and a rolled-back run under-reports by roughly 3x
--    (51s vs 165s, measured on the tag crons). So the full drain plausibly lands
--    near 110s against a statement_timeout of 2min -- which a function CANNOT
--    raise, because the timer arms when the top-level statement starts. A
--    timeout is a full rollback, and a db push that blocks CI for two minutes is
--    antisocial on a shared path. The script drains; each RPC call there is its
--    own top-level statement.
--
--    SOFT on the precondition: a zero pre-count is a clean no-op, not an abort.
--    A concurrent session may legitimately have drained it between authoring and
--    merge, and aborting there blocks every migration queued behind this one.
-- ---------------------------------------------------------------------------
do $$
declare v_before int; v_res jsonb;
begin
  select count(*) into v_before from public.events
   where exists (select 1 from unnest(images) i
                  where i like '%gaycities-featured-images-production.s3%');

  if v_before = 0 then
    raise notice 'dead_gaycities_images: already drained, nothing to prove';
    return;
  end if;

  v_res := public.run_event_dead_image_strip(300);

  if (v_res->>'updated')::int = 0 then
    raise exception 'run_event_dead_image_strip matched % rows but updated 0', v_before;
  end if;
  if (v_res->>'remaining')::int >= v_before then
    raise exception 'run_event_dead_image_strip did not reduce the backlog: % -> %',
      v_before, v_res->>'remaining';
  end if;

  raise notice 'dead_gaycities_images: proof batch updated %, remaining %',
    v_res->>'updated', v_res->>'remaining';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Positive control for the filter expression itself.
--
--    The corpus has ZERO mixed arrays (keeps_an_image=0, max_array_len=1), so
--    an assertion of the form "a row with a mixed array kept its survivor"
--    cannot fail here and would prove nothing. This one tests the expression
--    directly, so a rewrite to `images = '{}'` -- which is correct for every row
--    that exists today and destroys any mixed row that appears tomorrow -- fails
--    at apply time instead of silently.
-- ---------------------------------------------------------------------------
do $$
declare v_out text[];
begin
  v_out := array(
    select i from unnest(array[
      'https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_1.jpg',
      'https://example.com/good.jpg'
    ]) i
    where i not like '%gaycities-featured-images-production.s3%'
  );
  if v_out is distinct from array['https://example.com/good.jpg'] then
    raise exception 'dead-image filter dropped a live url: %', v_out;
  end if;

  v_out := array(
    select i from unnest(array[
      'https://gaycities-featured-images-production.s3.amazonaws.com/events/sm_fb_1.jpg'
    ]) i
    where i not like '%gaycities-featured-images-production.s3%'
  );
  if cardinality(v_out) <> 0 then
    raise exception 'dead-image filter kept a dead url: %', v_out;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Sentinel.
--
--    A STANDALONE function, deliberately, not a new key inside
--    pipeline_hygiene_stats(). That function is a CREATE OR REPLACE of ~150
--    lines, so adding one key means restating every other key by hand -- a
--    merge-collision surface where a single dropped line silently reverts
--    whatever another migration added, and the one step no test can catch.
--    event_dup_signals() (20270822093816) and venue_dup_signals()
--    (20330101100500) are standalone for exactly this reason; this follows them.
--
--    Reads are cheap and this is called once per health run, so it recomputes
--    rather than caching. The three "reported, not repaired" surfaces from
--    section 1 are included: they are 0 today, and if any of them ever becomes
--    non-zero that is a new producer, which is worth seeing.
--
--    check-pipeline-health.mjs WARNS while `remaining` falls and FAILS only
--    when it is non-zero with nothing draining it -- a hard fail on any
--    non-zero count would red every open PR for the duration of the drain.
-- ---------------------------------------------------------------------------
create or replace function public.dead_gaycities_image_signals()
returns jsonb
language sql
stable
security definer                 -- Definer is correct HERE and not on the
set search_path to 'public'      -- runner: this returns aggregate counts only,
as $fn$                          -- never rows, so it cannot leak a gated event.
  select jsonb_build_object(
    'remaining', (
      SELECT count(*) FROM public.events
      WHERE EXISTS (SELECT 1 FROM unnest(images) i
                     WHERE i LIKE '%gaycities-featured-images-production.s3%')
    ),
    'events_logo_url', (
      SELECT count(*) FROM public.events
      WHERE logo_url LIKE '%gaycities-featured-images-production.s3%'
    ),
    'venues_images', (
      SELECT count(*) FROM public.venues
      WHERE EXISTS (SELECT 1 FROM unnest(images) i
                     WHERE i LIKE '%gaycities-featured-images-production.s3%')
    ),
    'venues_logo_url', (
      SELECT count(*) FROM public.venues
      WHERE logo_url LIKE '%gaycities-featured-images-production.s3%'
    )
  );
$fn$;

comment on function public.dead_gaycities_image_signals() is
  'Counts remaining dead gaycities-featured-images S3 urls. Standalone rather '
  'than a pipeline_hygiene_stats key to avoid restating that function. Read by '
  'scripts/check-pipeline-health.mjs.';

revoke all on function public.dead_gaycities_image_signals() from public, anon, authenticated;
grant execute on function public.dead_gaycities_image_signals() to service_role;
