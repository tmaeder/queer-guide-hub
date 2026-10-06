-- tag_hygiene_stats() timed out a SEVENTH time, and the cause is new.
--
-- `Critical data-quality gates` failed PR #4189 on 2026-10-06 15:39 with
-- 57014 — and the single retry #3784 added ALSO failed. That retry exists
-- because occurrence #6 was contention, not cost; it is not contention now.
-- Measured on prod the same hour, the function does not complete in 55s and
-- an `explain (analyze)` of its heaviest arm could not finish either.
--
-- NOT the recorded causes. The visibility maps are healthy — events
-- 18922/18922 pages all-visible, unified_tag_assignments 6120/6120,
-- unified_tags 5390/5469 (99%) — so this is not the stale-VM index-only
-- thrash of occurrences #4 and #5, and `enable_indexonlyscan=off` +
-- `work_mem=48MB` from 99991790719601 are both still on the function
-- (proconfig verified before touching anything).
--
-- IT IS CORPUS GROWTH FLIPPING A PLAN. Against the numbers 99991790719601
-- recorded: events 36,940 -> 76,322 live tuples, unified_tag_assignments
-- 264,261 -> 476,217, unified_tags 10,370 -> 13,781. At that size the
-- planner's shape for `event_tag_pairs_unlinked` inverts:
--
--   ->  Nested Loop  (rows=25440)
--         Join Filter: (lower(btrim(t.t)) = lower(u.name))
--         ->  GroupAggregate  (rows=1)          <-- `unambiguous`
--         ->  Nested Loop    (rows=25440)       <-- ev x unnest
--
-- `unambiguous` ends in `having count(distinct tag_id) = 1`, which the
-- planner cannot estimate through, so it guesses ONE ROW. One row makes a
-- nested loop with a join filter look free, so it rescans the whole vocabulary
-- for every unnested event tag: ~88,600 outer rows x ~12,939 real inner rows,
-- about 10^9 lower() comparisons. The estimate is off by four orders of
-- magnitude and the true row count is what decides the join strategy.
--
-- THE FIX IS ONE WORD. `as materialized` on `unambiguous` makes it a CTE scan
-- the planner puts on the BUILD side of a hash join instead of rescanning:
--
--   ->  Hash Join
--         Hash Cond: (lower(btrim(t.t)) = v.key)
--         ->  Hash  ->  CTE Scan on unambiguous v  (actual rows=12939)
--
-- Measured on prod in a rolled-back transaction, same settings as the
-- function: that arm 2,402 ms / 30,511 blocks, and the WHOLE function
-- 1,923 ms against the 8,000 ms PostgREST ceiling, 27 keys returned,
-- event_tag_pairs_unlinked = 0 (its baseline) and totals intact
-- (active_tags 8,483 / categories 54 / assignments 483,911).
--
-- It changes NO predicate and NO counter. `materialized` is a planner
-- directive; the rows it yields are identical, which is why this is a
-- one-word patch rather than a rewrite of the arm.
--
-- WHY THIS PATCHES RATHER THAN RESTATES. The live body is not what any repo
-- file says: 99991789930597 narrowed four counters to publication_role by
-- string surgery and 99991790719601 added the shared CTEs the same way, so a
-- `create or replace` built from the newest FILE silently reverts both.
-- 99991790719601 established the rule; this follows it. Live prosrc md5 at
-- authoring time was ed181dd8f84d7c4bb5fdc1b15b8d8557.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. If a sibling session has
-- already materialized this CTE the file no-ops rather than aborting `db push`
-- for the whole repo; it raises only when it cannot do its job at all.

-- EVERY ASSERTION BELOW READS THE COMMENT-STRIPPED BODY, NEVER THE RAW ONE.
-- pg_get_functiondef() returns the body INCLUDING its comments, so a raw
-- `position()` can be satisfied by the prose explaining a symbol rather than
-- the symbol, and the check silently stops checking. That aborted `db push` on
-- main three times on 2026-09-20 and stranded the whole queue;
-- scripts/check-functiondef-asserts.mjs is the gate written after it, and it
-- caught the first draft of this file.
--
-- MEASURED, rather than asserted: today the risk here is LATENT, not active —
-- `ut as materialized` and `unambiguous as materialized` each occur ZERO times
-- in the live body's comments. What makes the strip worth having anyway is that
-- the body carries 4,229 bytes of prose that explicitly discusses these CTEs
-- and the work_mem/index-only-scan reasoning behind them, so one future
-- sentence naming a symbol turns a real check into a vacuous one with nothing
-- reporting it. Do not "simplify" this back to the raw body on the grounds that
-- the counts are zero; zero is the state the strip exists to preserve.
--
-- The RAW body is still what gets replaced and executed: stripping is for
-- deciding, never for writing, or the patch would publish a function with its
-- reasoning deleted.

do $patch$
declare
  v_src  text;   -- raw: what we replace and execute
  v_code text;   -- comment-stripped: what we assert on
  v_new  text;
  v_hits int;
  v_raw  int;
begin
  v_src  := pg_get_functiondef('public.tag_hygiene_stats()'::regprocedure);
  v_code := regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g');

  -- Already done by someone else: nothing to do, and NOT an error.
  if position('unambiguous as materialized' in v_code) > 0 then
    raise notice 'tag_hygiene_stats: unambiguous CTE already materialized — no-op';
    return;
  end if;

  -- The anchor must be unique IN THE CODE, or a blind replace hits the wrong CTE.
  select count(*) into v_hits
    from regexp_matches(v_code, '\), unambiguous as \(', 'g');

  if v_hits <> 1 then
    raise exception
      'tag_hygiene_stats: expected exactly 1 "), unambiguous as (" anchor in the code, found % — '
      'the function was restructured; re-derive the patch from pg_get_functiondef()',
      v_hits;
  end if;

  -- And exactly once in the RAW body too, because `replace()` rewrites every
  -- occurrence: a second hit would be inside a comment, and silently editing
  -- the prose that explains the CTE is not this file's job.
  select count(*) into v_raw
    from regexp_matches(v_src, '\), unambiguous as \(', 'g');

  if v_raw <> 1 then
    raise exception
      'tag_hygiene_stats: the anchor appears % times in the raw body (comments included) — '
      'replace() would rewrite a comment; re-derive the patch by hand', v_raw;
  end if;

  v_new := replace(v_src, '), unambiguous as (', '), unambiguous as materialized (');

  if v_new = v_src then
    raise exception 'tag_hygiene_stats: replace was a no-op despite a matching anchor';
  end if;

  execute v_new;
end
$patch$;

do $verify$
declare
  v_code text;   -- comment-stripped, for the same reason as the patch block
  v_cfg  text[];
  v_j    jsonb;
  v_t0   timestamptz;
  v_ms   int;
begin
  v_code := regexp_replace(
              pg_get_functiondef('public.tag_hygiene_stats()'::regprocedure),
              '--[^' || chr(10) || ']*', '', 'g');

  -- P1: the directive is on the function.
  if position('unambiguous as materialized' in v_code) = 0 then
    raise exception 'P1 failed: unambiguous CTE is not materialized';
  end if;

  -- P2: the shared CTEs 99991790719601 added survive. A `create or replace`
  -- drops them exactly as silently as it drops a counter, and without them
  -- the function re-reads unified_tags eleven times. Asserted on the stripped
  -- body so that a comment naming one of these CTEs can never stand in for the
  -- CTE itself.
  if position('ut as materialized' in v_code) = 0
     or position('uta_rollup as materialized' in v_code) = 0
     or position('ev_assign as materialized' in v_code) = 0
     or position('ev as materialized' in v_code) = 0 then
    raise exception 'P2 failed: a shared materialized CTE was lost';
  end if;

  -- P3: all three SET clauses survive. proconfig is dropped by a restate
  -- without any error, and 99991789807686 is the whole reason
  -- enable_indexonlyscan=off is there.
  select proconfig into v_cfg from pg_proc
   where oid = 'public.tag_hygiene_stats()'::regprocedure;

  if v_cfg is null
     or not (v_cfg @> array['enable_indexonlyscan=off'])
     or not (v_cfg @> array['work_mem=48MB'])
     or not (v_cfg @> array['search_path=public']) then
    raise exception 'P3 failed: proconfig lost a setting — got %', v_cfg;
  end if;

  -- P4: it EXECUTES. `create or replace function` only parses a plpgsql body;
  -- the queries inside it are planned at call time, so applying cleanly is not
  -- evidence the function works. Asserts the key this change is about plus
  -- `totals`, deliberately NOT an exact key count — a sibling adding a counter
  -- must not abort `db push` for the repo.
  v_t0 := clock_timestamp();
  v_j  := public.tag_hygiene_stats();
  v_ms := round(extract(epoch from (clock_timestamp() - v_t0)) * 1000);

  if v_j is null
     or not (v_j ? 'totals')
     or not (v_j ? 'event_tag_pairs_unlinked')
     or not (v_j ? 'event_tag_strings_unresolved') then
    raise exception 'P4 failed: tag_hygiene_stats() returned %', v_j;
  end if;

  -- P5: it is inside the ceiling the gate calls it through. Reported as a
  -- NOTICE and not an abort: this measures a shared instance under whatever
  -- load it happens to carry, and 99991791233588 is the live example of a
  -- postcondition on something the file does not own taking the whole repo
  -- down. The timing is evidence, not an invariant.
  if v_ms > 6000 then
    raise notice 'tag_hygiene_stats: % ms — within 8s but close; re-measure blocks, not warm ms', v_ms;
  else
    raise notice 'tag_hygiene_stats: % ms (ceiling 8000)', v_ms;
  end if;
end
$verify$;
