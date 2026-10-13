-- A city that LOSES its last venue stays published and empty for up to a month.
--
-- `run_city_trust_recompute` already deindexes a zero-content city: its classifier reads
-- `is_empty = (venues = 0 AND events = 0)` and routes such a row to `shell_status='ghost'` +
-- `seo_indexable = false`. That rule has been right since `20260821051221`. What is wrong is WHEN
-- the engine looks. Its `scope` CTE selects a city only when it has never been verified, when
-- `updated_at > last_verified_at`, or when `last_verified_at` is over 30 days old -- and
-- **deleting, merging or relinking a venue does not write the CITY row**, so neither of the first
-- two arms fires. The row waits for the 30-day arm.
--
-- MEASURED ON PROD, and the trust scores are what prove the mechanism rather than suggest it:
-- 39 indexable cities have zero venues and zero events; 33 of them predate today's 03:45 run, the
-- oldest created 2026-04-21. Every one carries `shell_status='real'` and a `trust_score` between
-- 22 and 61 -- and the classifier assigns exactly **15** when `is_empty`. So `is_empty` was FALSE
-- when each was last verified: they HAD content, and lost it afterwards. `last_verified_at` runs
-- 2026-09-26..2026-10-13, i.e. all inside 30 days, so none is a permanent escapee. The defect is a
-- bounded staleness window, not an unbounded gap, and this change takes it from <=30 days to <=1.
--
-- TWO HYPOTHESES WERE MEASURED AND KILLED FIRST, because both would have made this a non-defect.
-- (1) "They are just lag since the last nightly" -- false: 33 of 39 predate it. (2) "The sweep is
-- reading through a restricted role and cannot see safety-gated content, so these only LOOK empty"
-- -- this file's own §Geo entry records that exact trap ("anon cannot read safety-gated events, so
-- a sweep from that role checks a subset and reports it as the whole"). Also false, and checked
-- rather than assumed: the measuring session is `postgres` with `rolbypassrls`, seeing all 58,965
-- gated venues. A third guess -- that the `tmp-%` branch was the escape hatch -- was wrong too:
-- 0 of the 39 carry a `tmp-` slug.
--
-- THE ARM IS FILLABLE-GAP DRIVEN, which is what makes it terminate with no attempts counter:
-- it re-opens a row only while the classifier can close the exact condition that selected it.
-- Once the pass writes `shell_status='ghost'` and `seo_indexable=false`, the arm's own predicate is
-- false for that row and it is never selected again. That is the shape `99991790719660`
-- (`event_geo_fill`) and `99991791179763` (`venue_category_reclassify`) arrived at after both
-- cursors were found reaching the empty set forever; a nightly loop is impossible here by
-- construction rather than by a cap.
--
-- BLAST RADIUS IS MEASURED, NOT ASSERTED: the arm adds **33** rows to a scope of 2,365 (+1.4%),
-- costs 629 ms / 35,289 blocks as an index anti-join, and the job already rescores 900-3,500 rows
-- a night, so the spine -> `search_reindex_queue` churn this adds is noise against its own normal
-- traffic. The UPDATE is guarded `IS DISTINCT FROM` on all three columns, so a re-opened row that
-- needs no change costs no write at all.
--
-- `tmp-%` IS EXCLUDED DELIBERATELY. The classifier preserves `seo_indexable` for those rows
-- (`WHEN slug LIKE 'tmp-%' THEN seo_indexable`), and the 1,952 searchable `placeholder` shells are
-- a DISPOSITION backlog with a human decision attached -- not an indexer gap. Arming them here
-- would quietly reverse that, which is the opposite of what this change is for.
--
-- WHAT THE REPAIR TAKES, NAMED RATHER THAN BURIED IN A COUNT, because three of these are not junk:
-- `Jamestown` (SH) and `Saint-Pierre` (PM) are NATIONAL CAPITALS minted by `20261001110100`'s
-- `capital_repair`, both with no description; `Viana` (AO) has a population of 865,863; `Santana`
-- (BR) 107,618. All four genuinely have zero venues and zero events, so there is nothing on those
-- pages for a crawler to index, and the existing classifier would deindex all four on its own 30-day
-- schedule -- this does not invent a policy, it applies the one already shipped, sooner. It is also
-- self-reversing: the classifier's `WHEN shell_status='ghost' THEN true` arm re-indexes any of them
-- the moment real content arrives. At the other end of the same cohort sits
-- `Carrera 13 # 8-34, Barrio el Estero.` -- a street address minted as a city by the geocoder, which
-- `99991791903202` has since gated at the producer.
--
-- `v_examined` IS DELIBERATELY NOT ARMED, and the comment saying so is inserted AT THE SITE rather
-- than left only in this header, because this file already records what happens when two comments
-- in one body disagree about a behaviour. That count runs AFTER the UPDATE, which has already set
-- the armed rows to ghost + deindexed, so the arm's predicate is false for every one of them by the
-- time it is evaluated: adding it there would cost a second 629 ms anti-join and change no reported
-- number. (Noted and NOT fixed here: that count is taken after the UPDATE has bumped
-- `last_verified_at`, so it reports rows still due AFTER the pass, which is why prod shows the
-- impossible `rescored 2,976 > examined 2,357`. And `finished_at - started_at` is always 0.00s
-- because `now()` is transaction time. Both are reporting defects in a column this change does not
-- touch; fixing them means moving a statement and swapping `now()` for `clock_timestamp()`, which
-- is its own change with its own review.)

do $patch$
declare
  v_src        text;
  v_out        text;
  v_scope_before text;
  v_scope_after  text;
  v_exam_before  text;
  v_exam_after   text;
  v_n          int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'run_city_trust_recompute';

  if v_src is null then
    raise exception 'run_city_trust_recompute is absent; refusing to patch a function that is not there';
  end if;

  -- Idempotent: a re-run (or a rebuild from zero where a later migration already carries the arm)
  -- must not double-apply or fail.
  if position('FILLABLE-GAP ARM' in v_src) > 0 then
    raise notice 'city_trust_recompute already carries the re-open arm; nothing to patch';
    return;
  end if;

  v_scope_before :=
    E'      AND (p_force\n'
    '           OR c.last_verified_at IS NULL\n'
    '           OR c.updated_at > c.last_verified_at\n'
    '           OR c.last_verified_at < now() - interval ''30 days'')';

  v_scope_after :=
    E'      AND (p_force\n'
    '           OR c.last_verified_at IS NULL\n'
    '           OR c.updated_at > c.last_verified_at\n'
    '           OR c.last_verified_at < now() - interval ''30 days''\n'
    '           -- FILLABLE-GAP ARM (99991791920004). Losing the last venue or event never writes\n'
    '           -- the city row, so the two arms above cannot see it and the row stays published\n'
    '           -- and empty until the 30-day refresh. Re-open it only while the classifier can\n'
    '           -- close the very condition that selected it (is_empty -> ghost + deindexed), so\n'
    '           -- one pass resolves it and the predicate is false for it ever after. tmp- slugs\n'
    '           -- are excluded on purpose: the classifier preserves their seo_indexable and they\n'
    '           -- are a disposition backlog, not an indexer gap.\n'
    '           OR (c.slug NOT LIKE ''tmp-%''\n'
    '               AND (c.seo_indexable OR c.shell_status IS DISTINCT FROM ''ghost'')\n'
    '               AND NOT EXISTS (SELECT 1 FROM public.venues v\n'
    '                                WHERE v.city_id = c.id AND v.duplicate_of_id IS NULL)\n'
    '               AND NOT EXISTS (SELECT 1 FROM public.events e\n'
    '                                WHERE e.city_id = c.id AND e.duplicate_of_id IS NULL)))';

  v_exam_before := E'  SELECT count(*) INTO v_examined FROM public.cities c\n';
  v_exam_after  :=
    E'  -- NOT ARMED, deliberately: this runs after the UPDATE above has already written the armed\n'
    '  -- rows to ghost + deindexed, so the re-open arm is false for every one of them here and\n'
    '  -- repeating it would buy a second anti-join and no change in the reported number.\n'
    '  SELECT count(*) INTO v_examined FROM public.cities c\n';

  -- Exactly-once anchors. The scope predicate and the v_examined predicate are formatted
  -- differently in the live body (11-space vs 9-space continuation indents), which is what lets
  -- the scope one be targeted without touching the other -- asserted rather than assumed.
  v_n := (length(v_src) - length(replace(v_src, v_scope_before, ''))) / length(v_scope_before);
  if v_n <> 1 then
    raise exception 'scope anchor matched % times, expected exactly 1', v_n;
  end if;
  v_n := (length(v_src) - length(replace(v_src, v_exam_before, ''))) / length(v_exam_before);
  if v_n <> 1 then
    raise exception 'v_examined anchor matched % times, expected exactly 1', v_n;
  end if;

  v_out := replace(v_src, v_scope_before, v_scope_after);
  v_out := replace(v_out, v_exam_before, v_exam_after);

  if v_out = v_src then
    raise exception 'patch produced an identical body';
  end if;

  execute v_out;
end
$patch$;

-- One-shot: the rows already published and empty right now. The predicate is the ARM's own, so this
-- can only reach what the recurring arm would reach -- it cannot be a wider sweep wearing a
-- repair's clothes. Values mirror the classifier's own output for an empty row (ghost / not
-- indexable / trust 15) so the engine and the repair cannot disagree about the same row.
-- `last_verified_at` is deliberately left alone: the write bumps `updated_at`, so tonight's pass
-- still re-examines each row and gets to confirm the verdict rather than inherit it.
update public.cities c
set shell_status  = 'ghost',
    seo_indexable = false,
    trust_score   = 15
where c.duplicate_of_id is null
  and coalesce(c.enrichment_status->'disposition'->>'state','') <> 'not_a_city'
  and c.slug not like 'tmp-%'
  and (c.seo_indexable or c.shell_status is distinct from 'ghost')
  and not exists (select 1 from public.venues v where v.city_id = c.id and v.duplicate_of_id is null)
  and not exists (select 1 from public.events e where e.city_id = c.id and e.duplicate_of_id is null);

-- Sentinel. Extends the function `99991791903202`/`99991791906577` already own rather than adding a
-- third one, because this is the same question those keys ask: is anything published that should
-- not be? Restated in full (it is short and lives in this repo); the window logic is unchanged.
create or replace function public.city_publication_signals()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
  with gate as (
    -- 99991791903202, the migration that put the gate on city_resolve_or_create. See its header:
    -- the version's trailing ten digits are Unix epoch seconds.
    select to_timestamp(substr('99991791903202', 5)::bigint) as since
  ),
  recent as (
    select c.seo_indexable,
           (c.wikidata_qid is not null or c.wikipedia_title is not null) as has_identity
    from public.cities c, gate g
    where c.duplicate_of_id is null
      -- Rolling 2 days, but never reaching back past the gate: a row the gate could not have
      -- governed is not evidence about the gate.
      and c.created_at >= greatest(now() - interval '2 days', g.since)
  ),
  empty_published as (
    select c.created_at, c.last_verified_at
    from public.cities c
    where c.duplicate_of_id is null
      and coalesce(c.enrichment_status->'disposition'->>'state','') <> 'not_a_city'
      and c.slug not like 'tmp-%'
      and (c.seo_indexable or c.shell_status is distinct from 'ghost')
      and not exists (select 1 from public.venues v
                       where v.city_id = c.id and v.duplicate_of_id is null)
      and not exists (select 1 from public.events e
                       where e.city_id = c.id and e.duplicate_of_id is null)
  )
  select jsonb_build_object(
    'probe_ok', true,
    -- The window, before anything counted inside it.
    'gate_since', (select since from gate),
    -- Denominators first: a zero above an empty denominator is not a clean gate.
    'created_recent', (select count(*) from recent),
    'created_recent_with_identity', (select count(*) from recent where has_identity),
    -- The invariant, scoped to rows the gate could have governed.
    'published_without_identity_recent',
      (select count(*) from recent where seo_indexable and not has_identity),
    -- Context, never gated: the standing cohort predates the gate and falls only as
    -- city_qid_gap_link works through it or a human dispositions it.
    'cohort_total',
      (select count(*) from public.cities
        where duplicate_of_id is null and seo_indexable
          and wikidata_qid is null and wikipedia_title is null),
    -- ADVISORY. A city can legitimately sit here for up to a day: it loses its last venue at
    -- 05:50 and the recompute reaches it at 03:45 the next morning. Gating on the level would
    -- therefore fire on correct behaviour, which is the cry-wolf shape this repo has already
    -- removed twice (the dedup backlog's median-vs-oldest rule, and cohort_total above).
    'empty_published', (select count(*) from empty_published),
    -- THE GATED QUANTITY, and it is an AGE rather than a level. 36h is one nightly pass plus
    -- headroom: with the re-open arm in place every row above is resolved on the next run, so a
    -- row that has existed AND gone unverified for longer than that means the arm is not reaching
    -- it. Rows younger than a pass are excluded because they have not had their chance yet.
    'empty_published_stale',
      (select count(*) from empty_published
        where created_at < now() - interval '36 hours'
          and coalesce(last_verified_at, '-infinity'::timestamptz) < now() - interval '36 hours'),
    -- Proof the arm is on the function rather than on a comment about it -- and keyed on the
    -- PREDICATE over comment-stripped source, never on the marker comment. A sentinel that keys
    -- on a comment passes for a body whose comment was kept and whose code was deleted, which is
    -- the `uq_village_review_queue_open` mistake one object class over.
    'recompute_has_reopen_arm',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'run_city_trust_recompute'
          and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
              ilike '%NOT EXISTS (SELECT 1 FROM public.venues v%'),
    -- Proof the gate is on the resolver rather than on a comment about it.
    'resolver_sets_seo_indexable',
      (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'city_resolve_or_create'
          and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
              ilike '%field_provenance, seo_indexable)%')
  );
$fn$;

-- CREATE OR REPLACE preserves privileges, but restating them is what keeps a later rewrite from
-- silently widening the grant -- and P6 asserts it rather than assuming.
revoke all on function public.city_publication_signals() from public;
revoke all on function public.city_publication_signals() from anon, authenticated;
grant execute on function public.city_publication_signals() to service_role;

do $verify$
declare
  v_sig     jsonb;
  v_src     text;
  v_probe   uuid;
  v_seo     boolean;
  v_shell   text;
  v_caught  boolean := false;
  v_fixed   boolean := false;
begin
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
    into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'run_city_trust_recompute';

  -- P1: the arm is in the SCOPE, as executable SQL rather than as a comment. Asserted over
  -- comment-stripped source precisely because the arm ships with a six-line explanation that
  -- quotes its own predicate -- an unstripped check would pass with the statement deleted.
  if position('c.slug NOT LIKE ''tmp-%''' in v_src) = 0
     or position('AND NOT EXISTS (SELECT 1 FROM public.venues v' in v_src) = 0
     or position('AND NOT EXISTS (SELECT 1 FROM public.events e' in v_src) = 0 then
    raise exception 'P1 failed: the re-open arm is not in the scope predicate';
  end if;

  -- P2: and it is in the SCOPE, not somewhere harmless. The arm must sit before the counts CTE.
  if position('c.slug NOT LIKE ''tmp-%''' in v_src) > position('counts AS (' in v_src) then
    raise exception 'P2 failed: the arm is not inside the scope CTE';
  end if;

  -- P3: BEHAVIOURAL, and it is the only check that can tell a live arm from a dead one. A source
  -- test passes against a predicate the planner never reaches. Construct exactly the row the two
  -- pre-existing arms CANNOT see -- empty, published, and verified in this very transaction, so
  -- `updated_at > last_verified_at` is false and `last_verified_at < now() - 30 days` is false --
  -- then run the engine and require that it was still deindexed. Discarded by a subtransaction:
  -- plpgsql locals survive the rollback, so the verdict is readable afterwards while the writes
  -- are not.
  -- The disposition filter is load-bearing on the PROBE, not decoration: the scope excludes
  -- `not_a_city` rows entirely, so picking one would fail this test against a correct arm.
  select id into v_probe
  from public.cities
  where duplicate_of_id is null
    and coalesce(enrichment_status->'disposition'->>'state','') <> 'not_a_city'
    and slug not like 'tmp-%'
    and not exists (select 1 from public.venues v where v.city_id = cities.id and v.duplicate_of_id is null)
    and not exists (select 1 from public.events e where e.city_id = cities.id and e.duplicate_of_id is null)
  limit 1;

  if v_probe is null then
    raise exception 'P3 failed: no zero-content city exists to probe with, so the arm is untestable';
  end if;

  begin
    update public.cities
      set seo_indexable = true, shell_status = 'real', trust_score = 40, last_verified_at = now()
      where id = v_probe;

    -- Precondition for the probe itself: the row must now be invisible to the OLD arms, or the
    -- test proves nothing about the new one.
    if exists (select 1 from public.cities c
                where c.id = v_probe
                  and (c.last_verified_at is null
                       or c.updated_at > c.last_verified_at
                       or c.last_verified_at < now() - interval '30 days')) then
      raise exception 'ZZPROBE_INCONCLUSIVE';
    end if;

    perform public.run_city_trust_recompute(false);

    select seo_indexable, shell_status into v_seo, v_shell
    from public.cities where id = v_probe;
    v_fixed := (v_seo is false and v_shell = 'ghost');

    raise exception 'ZZPROBE_ROLLBACK';
  exception
    when others then
      if sqlerrm = 'ZZPROBE_ROLLBACK' then
        v_caught := true;
      elsif sqlerrm = 'ZZPROBE_INCONCLUSIVE' then
        raise exception 'P3 failed: the probe row stayed visible to the pre-existing arms, so the '
                        'test could not isolate the new one';
      else
        raise;
      end if;
  end;

  if not v_caught then
    raise exception 'P3 failed: the probe subtransaction did not roll back, so its writes survived';
  end if;
  if not v_fixed then
    raise exception 'P3 failed: a published empty city verified this second was NOT deindexed by '
                    'the recompute, so the re-open arm is not live';
  end if;

  -- P4: the one-shot left nothing STALE behind. Uses the sentinel rather than a re-derived
  -- predicate, so a sentinel that measures the wrong set fails here too.
  --
  -- IT ASSERTS THE AGED KEY AND DELIBERATELY NOT THE RAW COUNT, and a first draft had it the other
  -- way round and would have failed on correct behaviour. Every newly created city is empty and
  -- published until content arrives -- `city_resolve_or_create` publishes an identified row that
  -- by definition has no venues yet -- so a cron minting one city while this migration runs would
  -- take `empty_published` to 1 and abort `db push` for the whole repo over a row the engine will
  -- correctly deindex tonight. The aged key cannot move that way: a row created minutes ago is
  -- excluded by its own 36-hour floor. Assert what must never be true again, not what is
  -- momentarily true.
  v_sig := public.city_publication_signals();
  if coalesce((v_sig->>'probe_ok')::boolean, false) is not true then
    raise exception 'P4 failed: city_publication_signals did not answer';
  end if;
  if (v_sig->>'empty_published_stale')::int <> 0 then
    raise exception 'P4 failed: % cities have been published with no venues and no events for '
                    'longer than a nightly pass, so the one-shot or the arm did not reach them',
      v_sig->>'empty_published_stale';
  end if;

  -- P5: the sentinel can see both producers it exists to watch. Without this a later
  -- CREATE OR REPLACE could drop the arm and every count above would still read a clean zero.
  if coalesce((v_sig->>'recompute_has_reopen_arm')::boolean, false) is not true then
    raise exception 'P5 failed: the sentinel cannot see the re-open arm';
  end if;
  if coalesce((v_sig->>'resolver_sets_seo_indexable')::boolean, false) is not true then
    raise exception 'P5 failed: the sentinel cannot see the publication gate';
  end if;
  if not (v_sig ? 'gate_since') then
    raise exception 'P5 failed: the restatement dropped gate_since';
  end if;

  -- P6: still service_role only.
  if has_function_privilege('anon', 'public.city_publication_signals()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.city_publication_signals()', 'EXECUTE') then
    raise exception 'P6 failed: city_publication_signals is reachable by anon or authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.city_publication_signals()', 'EXECUTE') then
    raise exception 'P6 failed: service_role lost execute, so the health check cannot read it';
  end if;

  raise notice 'empty-shell re-open arm live; publication signals: %', v_sig;
end
$verify$;
