-- Dedup close-burst sentinel.
--
-- WHY THIS EXISTS. On 2026-09-20 an autonomous pass closed 676 open dedup pairs in a
-- single burst with the note "marked distinct. Candidate confidence is below the merge
-- threshold and no deterministic corroborating key was present". That reasoning is
-- inverted: 0.70 is the SWEEP'S OWN score for an uncorroborated candidate, i.e. a
-- statement about the producer's uncertainty, not evidence about the pair. The same
-- burst closed a `despace_corroborated` row scoring 0.97 while citing "below the merge
-- threshold", which is self-refuting. It also overrode 15 rows a reviewer had annotated
-- as explicitly undecidable.
--
-- The damage is invisible by construction. `status='rejected'` is the sweep's permanent
-- memory -- rejected pairs are never re-suggested -- so a wrong close does not surface as
-- a defect, it surfaces as a CLEAN QUEUE. Hand-measurement of that cohort put roughly
-- half of it at real duplicates with a mislinked city; those were made permanently
-- unfindable while every dashboard improved. It was caught five days later only because
-- a human happened to re-read the queue, and the only reason it was recoverable is that
-- a rejection mutates no entity.
--
-- WHAT THIS DETECTS, and why a burst rather than a rationale. "Was there evidence" is not
-- mechanically decidable from a note. Volume is. The legitimate closer
-- (`run_dedup_close_distinct`) is narrow by design and its observed ceiling is ~123
-- closes/day. The two real incidents on record are 676 (2026-09-20) and 589
-- (2026-08-01, note prefix "Auto-triage"). A threshold of 300 sits ~2.4x above normal
-- operation and below both incidents, so it fires on the shape that has actually gone
-- wrong twice and stays silent on the closer doing its job.
--
-- This deliberately does NOT gate on the note text. A prefix allowlist ("auto-distinct:",
-- "auto:") would be trivially satisfied by the next pass that picks a conforming prefix,
-- and would punish correct closes that word themselves differently. Volume cannot be
-- talked around.
--
-- COUNTS `rejected` ONLY, and `superseded` is deliberately excluded. The first draft
-- counted both on the reasoning that either removes a pair from the reviewable set -- and
-- the dry run against prod immediately fired on 2026-09-06, which was 530 `superseded`
-- rows produced as a MECHANICAL CASCADE: `approve_dedup_review` supersedes every other
-- open row touching the id it just dropped, so one legitimate merge wave manufactures
-- hundreds. That is the cry-wolf shape -- a gate red on arrival for correct work is one
-- people learn to scroll past. `rejected` is the status that ASSERTS "these are distinct"
-- and is the sweep's permanent memory, so it is the decision that can be both wrong and
-- invisible. Measured over all history with `superseded` excluded, the legitimate daily
-- ceiling is 125 and the one incident is 591 -- the threshold sits in that gap.
--
-- Reports `probe_ok` and `closes_total_ever` SEPARATELY from the burst list, because an
-- empty result must distinguish "no bursts" from "this function measured nothing" -- a
-- revoked grant, an empty table and a clean window otherwise all return the same
-- reassuring zero.

create or replace function public.dedup_close_burst_signals(
  p_days      int default 30,
  p_threshold int default 300
)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with closes as (
    select reviewed_at::date                                                as day,
           count(*)                                                         as closes,
           (array_agg(left(coalesce(reviewer_note, '(no note)'), 120)
                      order by id))[1]                                      as sample_note
      from public.dedup_review_queue
     where reviewer_id is null
       and status = 'rejected'
       and reviewed_at is not null
       and reviewed_at >= now() - make_interval(days => greatest(p_days, 1))
     group by 1
  )
  select jsonb_build_object(
    'probe_ok',          true,
    'window_days',       greatest(p_days, 1),
    'burst_threshold',   p_threshold,
    -- Reported first and unconditionally: zero bursts against zero closes ever is a
    -- broken probe, not a healthy engine.
    'closes_total_ever', (select count(*) from public.dedup_review_queue
                           where reviewer_id is null and status = 'rejected'),
    'closes_in_window',  coalesce((select sum(closes) from closes), 0),
    'max_day_count',     coalesce((select max(closes) from closes), 0),
    'bursts',            coalesce((select jsonb_agg(jsonb_build_object(
                                            'day',         day,
                                            'closes',      closes,
                                            'sample_note', sample_note)
                                          order by closes desc)
                                     from closes where closes > p_threshold), '[]'::jsonb)
  );
$fn$;

comment on function public.dedup_close_burst_signals(int, int) is
  'Detects evidence-free MASS closes of the dedup review queue. See migration header: '
  'status=rejected is the sweep''s permanent memory, so a wrong bulk close presents as a '
  'clean queue rather than as a defect. Gates on volume, not on note text.';

-- CREATE FUNCTION already granted EXECUTE to PUBLIC; narrow it.
revoke all on function public.dedup_close_burst_signals(int, int) from public;
revoke all on function public.dedup_close_burst_signals(int, int) from anon;
revoke all on function public.dedup_close_burst_signals(int, int) from authenticated;
grant execute on function public.dedup_close_burst_signals(int, int) to service_role;

do $verify$
declare v jsonb; ctrl jsonb;
begin
  -- The function runs and reports its own liveness.
  v := public.dedup_close_burst_signals();
  if coalesce((v->>'probe_ok')::boolean, false) is not true then
    raise exception 'dedup_close_burst_signals did not report probe_ok';
  end if;
  if coalesce((v->>'closes_total_ever')::bigint, 0) = 0 then
    raise exception 'dedup_close_burst_signals sees no machine closes at all - the probe is measuring nothing';
  end if;
  if jsonb_typeof(v->'bursts') <> 'array' then
    raise exception 'dedup_close_burst_signals.bursts is not an array';
  end if;

  -- POSITIVE CONTROL. An assertion that the detector finds nothing is equally satisfied
  -- by a detector that can find nothing. Drop the threshold to 0 and it must report at
  -- least one day, proving the burst arm is reachable against real data.
  ctrl := public.dedup_close_burst_signals(p_days => 3650, p_threshold => 0);
  if jsonb_array_length(ctrl->'bursts') = 0 then
    raise exception 'positive control failed: burst arm reported nothing at threshold 0 over 10 years';
  end if;

  raise notice 'dedup_close_burst_signals ok: % closes ever, max day % in window, % burst(s)',
    v->>'closes_total_ever', v->>'max_day_count', jsonb_array_length(v->'bursts');
end $verify$;
