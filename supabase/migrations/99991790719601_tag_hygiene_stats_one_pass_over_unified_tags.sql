-- tag_hygiene_stats(): one pass over `unified_tags`, and stop spilling to disk.
--
-- SIXTH occurrence of this gate flaking. `Tag hygiene has not regressed`
-- (scripts/check-tag-hygiene.mjs) is a REQUIRED check on every PR, PostgREST
-- connects as `authenticator` whose rolconfig pins statement_timeout = 8s, and on
-- 2026-09-28 it failed TWICE inside 20 minutes on PR #3999 with the single
-- built-in retry ALSO failing -- so it blocks every PR in the repo until a human
-- re-runs the job.
--
-- #3784 measured 1.3s warm against 8s -- 6x headroom -- concluded CONTENTION,
-- correctly for the evidence it had, and added that retry. THAT NO LONGER HOLDS,
-- AND THE RETRY CANNOT HELP, because the cause now persists across both attempts.
-- Measured on prod 2026-09-29, from pg_stat_statements rather than from a timing
-- I took -- these are the two live PostgREST call shapes, i.e. REAL CI calls:
--
--     1,983 calls   mean 1,883 ms   min   982   max 7,812 ms   sd 1,072
--     1,269 calls   mean 2,714 ms   min 1,063   max 7,854 ms   sd 1,484
--
-- MAX 7,854 ms AGAINST AN 8,000 ms CEILING. pg_stat_statements only records calls
-- that COMPLETED -- a call cancelled by 57014 never reaches max_exec_time -- so
-- the real distribution extends PAST 8s and 7,854 is merely the largest
-- survivor. Ten sequential calls the same day ran 1,868-5,412 ms wall, a 3.4x
-- spread. This is COST, with ordinary variance doing the rest.
--
-- TWO MEASURED COSTS. Blocks by RELATION over the inlined body:
--
--     unified_tags              11 scans   40,542 blk   49%
--     events                     1 scan    16,112 blk   19%
--     unified_tag_assignments    2 scans   12,240 blk   15%
--     tag_aliases                3 scans      753 blk
--     TOTAL (whole-query top node)        ~82,500 blk
--
-- (1) `unified_tags` IS SCANNED ELEVEN TIMES -- the same pathology
-- 70000101100000 fixed by folding the repeated scans of `unified_tag_assignments`
-- and `events` into shared materialized CTEs. It simply never did the third hot
-- table. `unified_tags` is 5,469 pages / 43 MB of heap for only 10,370 rows
-- (avg 1,242 B/row: long_description 428, description 176), so each full scan
-- costs far more than its row count suggests.
--
-- (2) IT SPILLS TO DISK AND RE-READS THE SPILL ELEVEN TIMES. Not recorded by any
-- previous pass on this function. `active as (select * from unified_tags ...)`
-- carries all 1,242 B/row for 8,477 rows = 10.5 MB against work_mem = 12 MB, and
-- spills. Root node of the plan:
--
--     Temp Written Blocks    1,281   (10.5 MB, `active` materialised once)
--     Temp Read Blocks      11,529   (92 MB, re-read by 11 CTE Scans)
--                          -------
--                          ~100 MB of temp I/O for ONE call
--
-- CTE Scan fan-out measured: active 11, uta_rollup 3, ev 3, ev_assign 2.
--
-- HOW THIS IS APPLIED, AND IT IS THE MOST IMPORTANT LINE IN THIS FILE. The body
-- is PATCHED via pg_get_functiondef() rather than restated, following
-- 99991789930597, which patches this same function the same way. The live body is
-- NOT what any repo file says: live prosrc md5 is 4102ec7c7ae4e7eecf3dcf7a4e765e26
-- while 99991789807686 -- the newest file that CONTAINS a definition -- claims
-- a7ed49bf570ac4e02b43dbf2d5936bde in its own header. 99991789930597 narrowed four
-- counters to `publication_role = 'article'` and added `entity_kind` to
-- duplicate_active_name's grouping key by string surgery, so a `create or replace`
-- built from the newest FILE silently reverts all of it. A first draft of this
-- migration did exactly that, and its dry run caught it: four counters differed
-- because the stale body was WIDER than production. `grep` for a definition does
-- not find a surgical patch -- read pg_get_functiondef() before restating any
-- function in this schema.
--
-- WHY `ut` IS `select *` RATHER THAN A NARROW PROJECTION. A narrow projection
-- (precomputing each text-dependent predicate, so the 1,242 B/row never enters a
-- tuplestore) measures better in isolation -- but it requires rewriting the
-- predicate at ten call sites, and those call sites are exactly the ones
-- 99991789930597 rewrote. `select *` is a DROP-IN for `from unified_tags`: not one
-- predicate changes, so no counter can silently change meaning, and the patch is
-- four `replace()` calls whose OUTCOME is asserted. The wider tuplestore is paid
-- for with work_mem below instead.
--
-- WHAT IS DELIBERATELY *NOT* REPOINTED, and this is the trap. The two arms of
-- `event_tag_strings_unresolved` keep reading `unified_tags` DIRECTLY: they are
-- `lower(u.name) = e.s` / `lower(u.slug) = e.s` lookups served by the functional
-- indexes 20260928143000 exists to preserve (measured here: Index Scan, 1,209 and
-- 629 blocks over 404 and 212 loops). A CTE Scan has no index, so repointing them
-- restores the 4M-row nested loop that put this function over the ceiling in the
-- first place. They are replaced along with the rest and then restored by name,
-- and the outcome assertion requires `from unified_tags` to end at exactly 3.
--
-- WORK_MEM IS SET ON THE FUNCTION, which is the whole of fix (2) and needs no body
-- change at all. Measured on the live function: at 12MB temp I/O is 12,810 blocks;
-- at 32MB it is 0. 48MB is chosen for margin over the ~23 MB the two tuplestores
-- now need together (ut 12.9 MB + active 10.5 MB) -- work_mem is per node, not per
-- statement. HONEST LIMIT: removing the spill did NOT measurably move warm
-- execution (min 1,445 -> 1,468 ms), because warm the temp file sits in the OS page
-- cache. It removes 100 MB of real I/O per call, which is what matters on THIS
-- instance -- see the contention note below -- but it is not provable from a
-- stopwatch and is not claimed to be.
--
-- MEASUREMENT NOTE, because two prior sessions got this wrong in opposite
-- directions and a third is easy: EXPLAIN reports Shared *and Temp* blocks
-- CUMULATIVELY up the plan tree. Per-node attribution is valid only on a node with
-- no children -- and additionally NOT on a `CTE Scan`, which is structurally
-- childless yet re-reports the buffers of producing its CTE. In the plan measured
-- here the leaf sum is 102,204 against a top-node total of 82,628, precisely
-- because 19 of the 48 leaves are CTE Scans. Prove a win with the WHOLE-QUERY TOP
-- NODE, and quote blocks, not warm milliseconds: 98.6% of this instance's reads are
-- cache hits, so warm timings hide the physical I/O that is the actual failure
-- mode. `shared_buffers` is 2 GB against a 16 GB database while
-- `search_reindex_drain` (mean 8.9 s, max 109 s, 190 BILLION blocks read),
-- `search_embeddings_reconcile` (197 billion) and
-- `run_staging_reconcile_committed` (522 billion) run continuously -- this
-- function's working set being evicted is the NORMAL state, not an edge case.
--
-- MEASURED AND REJECTED: raising the ceiling from inside the function. A
-- function-level `SET statement_timeout` does not extend an already-armed timer;
-- this repo has measured that before. The ceiling is `authenticator`'s rolconfig
-- and is not ours to move.
--
-- MEASURED AND NOT SHIPPED: a covering partial index on `events`
-- (99991789807686 built one in a rolled-back transaction: `ev` 16,112 -> 6,294
-- blocks). Still rejected for its reason -- it re-acquires the visibility-map
-- dependency that migration exists to remove, and costs a write-blocking SHARE
-- lock on a 126 MB ingest table.
--
-- OUTPUT IS UNCHANGED, and that is asserted rather than asserted-about: the
-- function is called BEFORE and AFTER the patch inside THIS transaction, so both
-- calls see one snapshot of a corpus that moves between calls, and any differing
-- key aborts.
--
-- MEASURED, by dry-running THIS FILE on prod in a transaction forced to roll back
-- (not a paraphrase of it -- a condensed copy drops the comments, and
-- pg_get_functiondef INCLUDES comments, which is how the assertion below came to
-- fire at 4; see the note at the insert):
--
--     shared blocks   85,305 -> 43,167   (-49%, whole-query top node)
--     temp I/O        12,810 ->      0   (-100%)
--     warm exec        ~1,450-2,420 -> 1,296 ms
--     output          identical, 27 keys, no differing key
--     proconfig       search_path, enable_indexonlyscan, work_mem all present
--
-- Rollback was verified rather than assumed: prosrc md5 still
-- 4102ec7c7ae4e7eecf3dcf7a4e765e26 and `ut as materialized` absent afterwards.
--
-- WHAT THIS DOES NOT FIX. 43,167 blocks is still a 337 MB working set, and
-- `events` (16,112) plus `unified_tag_assignments` (12,240) are now 66% of it --
-- both already folded, so the next lever there is autovacuum on `events`, not the
-- query. If this gate flakes a SEVENTH time, re-measure from pg_stat_statements
-- max_exec_time first: mean 1,883 ms against an 8,000 ms ceiling was never the
-- number that mattered.

do $patch$
declare
  v_def    text;
  v_new    text;
  v_before jsonb;
  v_after  jsonb;
  v_diff   text;
  n        int;
begin
  select pg_get_functiondef('public.tag_hygiene_stats()'::regprocedure) into v_def;
  if v_def is null then
    raise exception 'tag_hygiene_stats() is not defined';
  end if;

  -- SOFT ON PRECONDITIONS. Already folded -> nothing to do. A re-run, or another
  -- session having landed the same fold, must not abort `db push` for the repo.
  if position('ut as materialized' in v_def) > 0 then
    raise notice 'tag_hygiene_stats() already reads the shared `ut` CTE; body left alone';
  else
    -- The answer BEFORE the patch. Same transaction as the check below, so the
    -- comparison sees one snapshot.
    select public.tag_hygiene_stats() into v_before;

    -- Repoint every reader, then restore the two index-served arms by name. This
    -- is outcome-asserted rather than count-asserted on the way in, so a body
    -- that has gained an arm since this was written still patches correctly.
    v_new := replace(v_def, 'from unified_tags', 'from ut');
    v_new := replace(v_new,
      'from ut u where lower(u.name) = e.s',
      'from unified_tags u where lower(u.name) = e.s');
    v_new := replace(v_new,
      'from ut u where lower(u.slug) = e.s',
      'from unified_tags u where lower(u.slug) = e.s');

    -- Inserted AFTER the global replace, so `ut`'s own read is not rewritten to
    -- reference itself.
    -- The comment inside this block must NOT contain the phrase the outcome
    -- assertion below counts -- a first draft said "a drop-in for `from
    -- unified_tags`" and the insert therefore contributed TWO matches, so the
    -- assertion fired at 4 on correct logic. It failed in the safe direction and
    -- caught itself; the wording stays paraphrased on purpose.
    v_new := replace(v_new, '  with active as (', $ut$  with
  -- ── ONE pass over the tag table; see the header of this migration ──────
  -- `select *` is deliberate: it is a drop-in for the table reference it replaces,
  -- so not one predicate below changes and no counter can silently change meaning.
  -- The wider tuplestore is paid for by `SET work_mem` on this function -- at the
  -- default 12MB `active` spilled 10.5 MB and 11 CTE Scans re-read it, ~100 MB of
  -- temp I/O per call.
  ut as materialized (
    select * from unified_tags
  ),
  active as ($ut$);

    if position('ut as materialized' in v_new) = 0 then
      raise exception
        'could not insert the `ut` CTE: the `with active as (` anchor was not found in the live body';
    end if;

    -- OUTCOME assertions, before installing anything. `unified_tags` must end at
    -- exactly 3 reads: once in `ut`, twice in the index-served
    -- event_tag_strings_unresolved arms. 1 means the restore patterns missed and
    -- those arms lost their index; more than 3 means a reader was not folded.
    select count(*) into n from regexp_matches(v_new, 'from unified_tags', 'g');
    if n <> 3 then
      raise exception
        'refusing to install: `from unified_tags` would be read % times, expected 3 (once in `ut`, twice in the index-served event_tag_strings_unresolved arms)',
        n;
    end if;

    select count(*) into n from regexp_matches(v_new, 'from ut\M', 'g');
    if n < 9 then
      raise exception 'refusing to install: only % arms would read `ut`, expected at least 9', n;
    end if;

    execute v_new;

    -- THE POSTCONDITION THIS MIGRATION LIVES OR DIES BY.
    select public.tag_hygiene_stats() into v_after;

    if v_before is distinct from v_after then
      select string_agg(format('%s{before=%s after=%s}', k, v_before -> k, v_after -> k), ' ')
        into v_diff
        from jsonb_object_keys(v_before) as k
       where (v_before -> k) is distinct from (v_after -> k);
      raise exception 'the fold changed the answer: %', coalesce(v_diff, '(key set differs)');
    end if;
  end if;
end $patch$;

-- Fix (2), independent of the body and therefore of anyone else's patches.
alter function public.tag_hygiene_stats() set work_mem to '48MB';

-- Postconditions. Assert the REACHED state, not the number of edits: a count of
-- changed things reads zero both when the work is already done and when it never
-- ran.
do $verify$
declare src text; n int; cfg text[];
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public' and p.proname = 'tag_hygiene_stats';

  if src is null then
    raise exception 'tag_hygiene_stats is not defined';
  end if;

  -- pg_get_functiondef() includes comments. Strip them before structural
  -- assertions so explanatory prose cannot satisfy a missing-code check.
  src := regexp_replace(src, '--[^' || chr(10) || ']*', '', 'g');

  select p.proconfig into cfg
    from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public' and p.proname = 'tag_hygiene_stats';

  -- All three settings. `create or replace` RESETS proconfig wholesale when the
  -- new definition omits a SET clause, so a later restatement that forgets one
  -- line silently reinstates the cost it removed while every other assertion
  -- here still passes. Losing search_path on a SECURITY DEFINER function is a
  -- security defect rather than a performance one.
  if cfg is null or not ('search_path=public' = any(cfg)) then
    raise exception 'tag_hygiene_stats lost SET search_path=public (proconfig=%)', cfg;
  end if;

  if not ('enable_indexonlyscan=off' = any(cfg)) then
    raise exception
      'tag_hygiene_stats lost SET enable_indexonlyscan=off; 99991789807686''s 45,945-block index-only scan is back (proconfig=%)',
      cfg;
  end if;

  if not ('work_mem=48MB' = any(cfg)) then
    raise exception
      'tag_hygiene_stats lost SET work_mem=48MB; `active` spills again and 11 CTE Scans re-read ~100 MB of temp per call (proconfig=%)',
      cfg;
  end if;

  -- ── the fold ─────────────────────────────────────────────────────────────
  if position('ut as materialized' in src) = 0 then
    raise exception 'the shared `ut` CTE is missing; unified_tags is scanned per-arm again';
  end if;

  select count(*) into n from regexp_matches(src, 'from unified_tags', 'g');
  if n <> 3 then
    raise exception
      'unified_tags is read % times, expected 3 (once in `ut`, twice in the index-served event_tag_strings_unresolved arms)',
      n;
  end if;

  -- ── 70000101100000's invariants, carried forward unchanged ───────────────
  if position('uta_rollup as materialized' in src) = 0
     or position('ev_assign as materialized' in src) = 0
     or position('ev as materialized' in src) = 0 then
    raise exception 'a shared CTE is missing; the duplicated scans are back';
  end if;

  select count(*) into n from regexp_matches(src, 'from unified_tag_assignments', 'g');
  if n <> 2 then
    raise exception 'unified_tag_assignments is read % times, expected 2', n;
  end if;

  select count(*) into n from regexp_matches(src, 'from events', 'g');
  if n <> 1 then
    raise exception 'events is read % times, expected 1', n;
  end if;

  -- The 20260928143000 invariant. Re-merging the two arms into one OR restores a
  -- 4M-row nested loop.
  if position('or lower(u.slug)' in src) > 0 then
    raise exception 'event_tag_strings_unresolved re-merged its two NOT EXISTS arms';
  end if;

  -- 99991789930597's narrowing must survive this fold. It was reverted once, by
  -- this migration's own first draft.
  if position('publication_role = ''article''' in src) = 0 then
    raise exception
      '99991789930597''s publication_role scoping is gone; the body was restated from a stale file';
  end if;

  -- The function still EXECUTES and still returns every counter. Calling it is the
  -- point: a body that is syntactically valid but references a CTE that is no
  -- longer in scope installs cleanly and fails at call time, in CI, on somebody
  -- else's PR. `assert_admin_or_internal()` returns early for a session with no JWT
  -- claims, which is what `db push` is, so this is reachable here.
  --
  -- 27, counted from the live response rather than from the SQL text, because
  -- check-tag-hygiene.mjs derives its metric list from that response too: a counter
  -- that vanishes is simply not checked, with no "expected metric missing" failure
  -- anywhere.
  select count(*) into n from jsonb_object_keys(public.tag_hygiene_stats());
  if n <> 27 then
    raise exception 'tag_hygiene_stats returns % top-level keys, expected 27', n;
  end if;
end $verify$;
