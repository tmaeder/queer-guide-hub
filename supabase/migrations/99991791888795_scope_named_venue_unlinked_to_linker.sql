-- NAMED_VENUE_UNLINKED flagged 13,820 events the linker is designed never to reach.
--
-- Measured on prod. 16,193 open `NAMED_VENUE_UNLINKED` issues, and the detector that raises them,
-- `event_quality_findings(p_event_id)`, carries NO window at all:
--
--     select 'linkage','NAMED_VENUE_UNLINKED','medium', ...
--       from e where nullif(btrim(venue_name),'') is not null and venue_id is null
--
-- Its producer is windowed. `run_event_venue_link` calls `link_event_venues(500, true, false)`, and
-- `p_active_only = true` makes `find_event_venue_candidates` select only
--
--     e.city_id IS NOT NULL
--     AND (NOT p_active_only OR e.start_date IS NULL OR e.start_date >= now() - interval '1 year')
--
-- So of the 16,193 flagged: 13,820 have a `start_date` older than a year, 1,525 have no `city_id`,
-- and only 2,183 are reachable by the engine's own work list. The oldest flagged event is from
-- 2012-09-27. 85% of that queue is work no engine will ever do, and no human will either -- the
-- queue's approve/reject does not touch the record, so the row is a permanent decoration.
--
-- A DETECTOR SCOPED WIDER THAN ITS PRODUCER CANNOT REPORT ANYTHING ACTIONABLE. This is the mirror
-- of the `prose_unreviewed` defect (`99991790828215`), where a gauge scoped NARROWER than its
-- producer could not report that producer stopping. Either mismatch makes the number useless; this
-- one inflates instead of hiding.
--
-- THE LINKER IS DELIBERATELY NOT WIDENED, and that was the explicit alternative. Linking a decade
-- of Wayback-imported events would run the namesake risk this repo documents at length
-- (`99991790379818`: a venue link propagated a city 1,718 km because "The Eagle" is a bar name in a
-- dozen cities) across rows no reader is attending, for no reader value. `events` deliberately
-- holds ~36.5k past events, so a past date is not a defect here -- it is the corpus.
--
-- WHAT MAKES THIS DRAIN rather than merely stop growing: `run_event_quality_scan` already carries
-- an auto-resolve branch that closes an open row whose code the detector no longer emits
-- (`resolution = 'cleared_by_scan'`). It runs every 5 minutes at `p_batch=1000, p_scope='all'`, and
-- re-assesses a historical event every 30 days, so the 13,820 close on their own. P5 asserts that
-- branch still exists, because without it this change strands them silently instead.
--
-- Mirrored conditions, NOT the CTE's own `event_scope`. That column is
-- `coalesce(end_date,start_date) >= now()`, which is a different line: the linker reaches events
-- that ENDED up to a year ago, so scoping on `event_scope` would under-flag reachable work.
--
-- The place-collision exclusions in the linker's selector (a `venue_name` that is really a city or
-- queer-village name, per `20260802100455`) are deliberately NOT mirrored: those rows are a real
-- data defect worth surfacing even though no link will ever be made for them.
--
-- Patched by string surgery on the LIVE definition rather than restated: the function is 8,431
-- characters of ~20 union arms and is the sole detector for every event quality code, so a
-- transcription slip would silently change an unrelated arm (the `99991790719601` precedent).

do $patch$
declare
  v_src    text;
  v_before text := 'from e where nullif(btrim(venue_name),'''') is not null and venue_id is null';
  v_after  text := 'from e where nullif(btrim(venue_name),'''') is not null and venue_id is null'
                || E'\n        and city_id is not null'
                || E'\n        and (start_date is null or start_date >= now() - interval ''1 year'')';
  v_n      integer;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'event_quality_findings';

  if v_src is null then
    raise exception 'event_quality_findings not found';
  end if;

  -- Already patched (a re-run, or a concurrent session got there first): leave it alone.
  if position(v_after in v_src) > 0 then
    raise notice 'event_quality_findings already carries the linker scope -- nothing to do';
    return;
  end if;

  -- Exactly once, or abort without touching the function. More than one occurrence means the arm
  -- was duplicated and a blind replace would scope an arm this file never read.
  v_n := (length(v_src) - length(replace(v_src, v_before, ''))) / length(v_before);
  if coalesce(v_n, 0) <> 1 then
    raise exception 'anchor occurs % times, expected exactly 1 -- refusing to patch', v_n;
  end if;

  execute replace(v_src, v_before, v_after);
end
$patch$;

do $verify$
declare
  v_src   text;
  v_old   uuid;
  v_nocty uuid;
  v_live  uuid;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'event_quality_findings';

  -- P1: the new predicate is on the function.
  if position('and (start_date is null or start_date >= now() - interval ''1 year'')' in v_src) = 0
     or position('and city_id is not null' in v_src) = 0 then
    raise exception 'P1 failed: the linker scope is not present on event_quality_findings';
  end if;

  -- P2: BEHAVIOURAL, out-of-window. An event with a venue_name, no venue_id, a city and a
  -- start_date older than a year must no longer be flagged. Asserting the source text alone cannot
  -- tell a live predicate from a dead one.
  select ev.id into v_old
  from public.events ev
  where ev.duplicate_of_id is null
    and nullif(btrim(ev.venue_name), '') is not null
    and ev.venue_id is null
    and ev.city_id is not null
    and ev.start_date < now() - interval '1 year'
  limit 1;
  if v_old is null then
    raise exception 'P2 failed: no out-of-window fixture exists, so P2 and P4 would be vacuous';
  end if;
  if exists (select 1 from public.event_quality_findings(v_old)
             where issue_code = 'NAMED_VENUE_UNLINKED') then
    raise exception 'P2 failed: event % is out of the linker window and is still flagged', v_old;
  end if;

  -- P3: BEHAVIOURAL, no city. The linker requires city_id, so a cityless event must not be flagged.
  select ev.id into v_nocty
  from public.events ev
  where ev.duplicate_of_id is null
    and nullif(btrim(ev.venue_name), '') is not null
    and ev.venue_id is null
    and ev.city_id is null
  limit 1;
  if v_nocty is not null then
    if exists (select 1 from public.event_quality_findings(v_nocty)
               where issue_code = 'NAMED_VENUE_UNLINKED') then
      raise exception 'P3 failed: event % has no city_id and is still flagged', v_nocty;
    end if;
  end if;

  -- P4: POSITIVE CONTROL. A reachable event must STILL be flagged. Without this, deleting the arm
  -- outright satisfies P2 and P3 perfectly, and the detector would stop reporting real work.
  select ev.id into v_live
  from public.events ev
  where ev.duplicate_of_id is null
    and nullif(btrim(ev.venue_name), '') is not null
    and ev.venue_id is null
    and ev.city_id is not null
    and (ev.start_date is null or ev.start_date >= now() - interval '1 year')
    and not exists (select 1 from public.cities c
                    where c.duplicate_of_id is null
                      and lower(btrim(c.name)) = lower(btrim(ev.venue_name)))
    and not exists (select 1 from public.queer_villages qv
                    where lower(btrim(qv.name)) = lower(btrim(ev.venue_name)))
  limit 1;
  if v_live is null then
    raise exception 'P4 failed: no in-window fixture exists, so P2 and P3 prove nothing';
  end if;
  if not exists (select 1 from public.event_quality_findings(v_live)
                 where issue_code = 'NAMED_VENUE_UNLINKED') then
    raise exception 'P4 failed: event % is reachable by the linker and is no longer flagged', v_live;
  end if;

  -- P5: the drain this change depends on must still exist. Without the scan's auto-resolve branch
  -- the 13,820 open rows are stranded rather than closed, and nothing else would say so.
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'run_event_quality_scan';
  if position('cleared_by_scan' in coalesce(v_src, '')) = 0
     or position('not(issue_code=any(v_codes))' in replace(coalesce(v_src, ''), ' ', '')) = 0 then
    raise exception
      'P5 failed: run_event_quality_scan no longer auto-resolves codes the detector stopped '
      'emitting -- the stale NAMED_VENUE_UNLINKED rows would be stranded, not drained';
  end if;

  raise notice 'NAMED_VENUE_UNLINKED scoped to the linker; stale rows drain via cleared_by_scan';
end
$verify$;
