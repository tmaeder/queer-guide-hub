-- tag_ontology_recompute timed out for the first time on 2026-10-23 04:52 after a
-- clean 13-day success streak, and sat at consecutive_failures=1 against
-- auto_pause_threshold=3. Two more failures and auto-pause would have set
-- enabled=false -- the state CLAUDE.md records as indistinguishable from a
-- deliberate retirement, because the success branch of
-- admin_automation_runs_after_finish() resets the counter and never re-enables.
--
-- MEASURED on prod, per arm, before any change. The whole ~47s sits in two
-- places and every other arm is 0-24ms:
--
--   facet_coverage   (count(distinct concept_id) from tag_facets)  18,415 ms
--   facets           (the SAME view, read a second time)          ~18,400 ms
--   active_zero_usage                                              5,152 ms
--   human_reviewed_unused (same shape)                            ~5,152 ms
--   every other arm, together                                        ~48 ms
--
-- DEFECT 1 -- tag_facet_of cannot be inlined, so a CASE became ~1M real calls.
-- public.tag_facet_of is `language sql immutable` and is nothing but a CASE over
-- a literal vocabulary, i.e. exactly the shape the planner inlines into the
-- scan. It carried `SET search_path TO 'pg_catalog, public, extensions, auth,
-- storage'`, and **a SQL function with a SET clause is never inlined**. The
-- tag_facets view calls it TWICE per row (once in SELECT, once in WHERE) over
-- 488,051 rows, and tag_ontology_health reads that view twice -- ~2M calls.
--
-- Proof it is the function call and not I/O: the current plan reads only
-- `shared hit=6426` blocks, entirely cached, and still spends 18,054 ms inside
-- the Seq Scan (~37us per cached row). Replacing the call with the identical
-- CASE expression, same seq-scan plan, same 6,393 blocks: 707 ms. 26x, and on
-- BOTH axes -- time down 26x at an unchanged block count, so this is not the
-- warm-ms-hides-physical-I/O trade CLAUDE.md warns about. (Measured for
-- completeness: with the CASE inlined the planner prefers index paths at 2,104
-- ms / 231,379 blocks or 895 ms / 465,449 blocks -- both faster than today and
-- both far worse on blocks. No planner GUC is pinned here: every one of those
-- plans clears the ceiling with room, and pinning one is a bet on a visibility
-- map that moves. Re-measure before adding one.)
--
-- `reset all`, NOT `create or replace` minus the clause, and NOT
-- `reset search_path`: inlining tests `proconfig IS NOT NULL`, so an
-- empty-but-present array still blocks it. Precedent and the same reasoning:
-- 99991791631907_logo_platform_signals_inlinable_predicate.sql.
--
-- tag_facet_of is SECURITY INVOKER (prosecdef=false, asserted below), which is
-- what makes unpinning safe -- the same line that migration draws around its
-- four INVOKER helpers while refusing to unpin its DEFINER sentinel. Nothing is
-- unpinned here that is SECURITY DEFINER: api_private.tag_ontology_health and
-- api_guard.tag_usage_summary_rows both keep their search_path, asserted below.
-- The body references no table and no operator outside pg_catalog, and after
-- inlining the expression is evaluated in the caller's context like any other
-- inline expression, so unpinning adds no resolution surface.
--
-- The three other callers of tag_facet_of pay the same per-row penalty and all
-- get cheaper, but NONE OF THEM IS BROKEN -- measured rather than assumed,
-- because "this also fixes N other things" sends the next reader hunting an
-- outage that does not exist:
--   public.run_content_graph_recompute -- cron content_graph_recompute,
--     succeeding daily, 6.2-13.6 s per run, 0 consecutive failures.
--   public.get_marketplace_tag_facets  -- a public RPC, so it runs under the
--     8 s PostgREST ceiling, and sits at 480 ms cold / 226 ms warm. It filters
--     by department/stock instead of scanning the whole table.
--   api_private.tag_coverage_radar     -- no cron job and no registry row, so
--     it is not on a schedule at all.
-- tag_ontology_health is the only one that reads tag_facets TWICE AND
-- unfiltered, which is why it is the one that hit the ceiling.
--
-- No functional index is built on tag_facet_of (checked: 0 rows in pg_index
-- matching), so nothing has to be reindexed and no plan depends on its
-- volatility label.
--
-- DEFECT 2 -- a set-returning function in a correlated subquery, 4,812 times.
-- public.tag_usage_summary is a view over api_guard.tag_usage_summary_rows(), a
-- SECURITY DEFINER SRF reading api_cache.tag_usage_summary. Asked for one id at
-- a time it cannot be pushed down, so the plan reads
-- `Function Scan ... rows=1 loops=4812` with `Rows Removed by Filter: 10427`
-- each pass -- it materialises all 10,428 cache rows and throws away 10,427 of
-- them, 4,812 times, ~50M rows scanned per arm, twice.
--
-- Both arms become a LEFT JOIN against the SRF evaluated ONCE: 5,152 ms -> 17 ms
-- each. The join cannot multiply rows, which is checked rather than assumed:
-- tag_usage_summary holds 10,428 rows and 10,428 distinct ids. The SRF stays
-- SECURITY DEFINER and stays pinned; only the call shape changes.
--
-- Equivalence was proven on prod BEFORE this was written -- old 2,718 / 2,891,
-- new 2,718 / 2,891 -- and is re-proven at apply time by P5 below, which
-- recomputes the OLD correlated form in the same transaction and compares. No
-- count is pinned in this file: both move with the corpus, and a frozen number
-- is a precondition wearing a postcondition's clothes.
--
-- The body is PATCHED from pg_get_functiondef() with exactly-once anchors
-- rather than restated. CLAUDE.md records that the live body of a tag function
-- is routinely NOT what the newest repo migration says (99991789930597 edited
-- tag_hygiene_stats by string surgery, so a restate built from the newest file
-- silently reverted it), and this body has four migrations in its history. The
-- anchors were counted on the live definition first: 1, 1 and 2.
--
-- APPLIED TO PROD AHEAD OF THIS FILE, 2026-10-23, and that is why the patch
-- block is idempotent rather than exact-match. While measuring the before/after
-- on prod I ran the two statements inside a transaction that carried no trailing
-- abort, and `execute_sql` runs one call as one transaction -- so it COMMITTED.
-- Absence of an error IS the commit signature there. The change that landed is
-- byte-identical to what this file applies and had already passed P0-P6 in a
-- properly rolled-back dry run, so prod is in the intended end state; what was
-- missing is the schema_migrations row, which merging this file supplies. No
-- version drift results (no history row was written, so nothing is orphaned),
-- but an exact-match precondition WOULD now abort `db push` for every migration
-- queued behind it, since the live body already has 0 correlated subqueries and
-- 2 joins. Both branches are exercised: the no-op branch against live prod, and
-- the patch branch against a body reverted to the old shape inside a rolled-back
-- transaction.
--
-- Guarded by src/lib/__tests__/tagOntologyHealthInlinable.test.ts.

begin;

-- 1. Unpin the vocabulary CASE so the planner can inline it. INVOKER only.
alter function public.tag_facet_of(text) reset all;

-- 2. Replace the two correlated-SRF arms with a join against one evaluation.
do $patch$
declare
  v_src text;
  v_out text;
  v_a1  constant text := '''active_zero_usage'',     (select count(*) from public.unified_tags t where t.status=''active''';
  v_a2  constant text := '''human_reviewed_unused'', (select count(*) from public.unified_tags t where t.status=''active''';
  v_sub constant text := 'and coalesce((select usage_count from public.tag_usage_summary s where s.id=t.id),0)=0';
  v_join constant text := ' left join public.tag_usage_summary s on s.id=t.id where t.status=''active''';
  v_done constant text := 'left join public.tag_usage_summary s on s.id=t.id';
  v_bare text;
  n int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
  where n2.nspname = 'api_private' and p.proname = 'tag_ontology_health';

  if v_src is null then
    raise exception 'P0 failed: api_private.tag_ontology_health not found';
  end if;

  -- COUNT on a comment-stripped copy, REWRITE the original. pg_get_functiondef
  -- returns the body including its comments, so counting on the raw text matches
  -- prose as well as code -- which aborted `db push` on main three times on
  -- 2026-09-20 and stranded the whole deploy queue, since nothing fails until
  -- apply time. Stripping for the rewrite instead would DELETE the function's
  -- own comments from the body written back, so the two reads are separate.
  v_bare := regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g');

  -- SOFT on preconditions. The join shape already being present means this body
  -- is already in the end state -- a rerun, a rebuild over a later migration, or
  -- a sibling that got here first -- and re-patching is a no-op at best. An
  -- exact-match premise here would abort `db push` for the WHOLE repo, which is
  -- the blast radius CLAUDE.md records from two individually-correct changes.
  -- The postconditions below are what actually hold the line, and they run in
  -- both branches.
  n := (length(v_bare) - length(replace(v_bare, v_done, ''))) / length(v_done);
  if n = 2 then
    raise notice 'tag_ontology_health already carries both joins; nothing to patch';
  else
    -- Exactly-once anchors on the unpatched body. A silently-unmatched replace
    -- is indistinguishable from a guard that does not fire, so each count is
    -- asserted rather than hoped for.
    n := (length(v_bare) - length(replace(v_bare, v_a1, ''))) / length(v_a1);
    if n <> 1 then raise exception 'P0 failed: active_zero_usage anchor matched % times, expected 1', n; end if;
    n := (length(v_bare) - length(replace(v_bare, v_a2, ''))) / length(v_a2);
    if n <> 1 then raise exception 'P0 failed: human_reviewed_unused anchor matched % times, expected 1', n; end if;
    n := (length(v_bare) - length(replace(v_bare, v_sub, ''))) / length(v_sub);
    if n <> 2 then raise exception 'P0 failed: correlated subquery matched % times, expected 2', n; end if;

    v_out := replace(v_src, v_a1, replace(v_a1, ' where t.status=''active''', v_join));
    v_out := replace(v_out, v_a2, replace(v_a2, ' where t.status=''active''', v_join));
    v_out := replace(v_out, v_sub, 'and coalesce(s.usage_count,0)=0');

    if v_out = v_src then
      raise exception 'P0 failed: patch produced an identical body';
    end if;

    execute v_out;
  end if;
end $patch$;

-- 3. Postconditions. Hard on the END STATE, and deliberately silent on timing:
--    a wall-clock RAISE here can fail on correct code on a loaded instance and
--    `db push` aborts on the first failing file, taking every migration queued
--    behind it. The regression guard is structural (P4) -- the shape that was
--    slow cannot come back without failing it -- and the numbers live in the
--    header and in the test.
do $verify$
declare
  v_def text;
  v_cfg text[];
  v_secdef boolean;
  v_vol "char";
  v jsonb;
  v_old_azu bigint;
  v_old_hru bigint;
  n int;
  t0 timestamptz;
  v_ms numeric;
begin
  -- P1: the facet CASE is inlinable (proconfig NULL, not merely search_path-less).
  select p.proconfig, p.prosecdef, p.provolatile into v_cfg, v_secdef, v_vol
  from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
  where n2.nspname = 'public' and p.proname = 'tag_facet_of';
  if v_cfg is not null then
    raise exception 'P1 failed: tag_facet_of still carries proconfig %, so it is still not inlinable', v_cfg;
  end if;

  -- P2: unpinning must not have changed what the function IS.
  if v_secdef then
    raise exception 'P2 failed: tag_facet_of became SECURITY DEFINER; an unpinned definer is a search_path-injection surface';
  end if;
  if v_vol <> 'i' then
    raise exception 'P2 failed: tag_facet_of is no longer IMMUTABLE (provolatile=%)', v_vol;
  end if;

  -- P3: the two SECURITY DEFINER functions in this path stay pinned.
  for n in
    select 1 from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
    where (n2.nspname, p.proname) in (('api_private','tag_ontology_health'), ('api_guard','tag_usage_summary_rows'))
      and (p.prosecdef is false or p.proconfig is null)
  loop
    raise exception 'P3 failed: a SECURITY DEFINER function in this path lost its pin or its definer flag';
  end loop;

  -- P4: the slow shape is gone and the join is in, twice. This is the
  --     regression guard -- a later CREATE OR REPLACE that reinstates the
  --     correlated subquery fails here.
  -- Comment-stripped, for the same reason as the patch block above: an ABSENCE
  -- check goes falsely RED when a comment mentions the symbol, and a PRESENCE
  -- check goes falsely GREEN when it exists only in prose.
  select regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') into v_def
  from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
  where n2.nspname = 'api_private' and p.proname = 'tag_ontology_health';
  if position('(select usage_count from public.tag_usage_summary s where s.id=t.id)' in v_def) > 0 then
    raise exception 'P4 failed: the correlated SRF subquery is still in the body';
  end if;
  n := (length(v_def) - length(replace(v_def, 'left join public.tag_usage_summary s on s.id=t.id', ''))) / length('left join public.tag_usage_summary s on s.id=t.id');
  if n <> 2 then
    raise exception 'P4 failed: expected 2 joins against tag_usage_summary, found %', n;
  end if;

  -- P5: it EXECUTES -- a plpgsql/sql body only parses at create time, and
  --     CLAUDE.md records a RETURNS TABLE function that applied cleanly and
  --     raised 42702 when first CALLED. Then: every key survives, and the two
  --     repaired arms equal the OLD correlated form computed in this same
  --     transaction. Equivalence, not a pinned count.
  t0 := clock_timestamp();
  v := public.tag_ontology_health();
  v_ms := round(extract(epoch from clock_timestamp() - t0) * 1000);

  for n in select 1 where (select count(*) from jsonb_object_keys(v)) <> 14 loop
    raise exception 'P5 failed: tag_ontology_health returned % keys, expected 14', (select count(*) from jsonb_object_keys(v));
  end loop;

  select count(*) into v_old_azu from public.unified_tags t
   where t.status='active' and coalesce(t.human_reviewed,false)=false
     and coalesce((select usage_count from public.tag_usage_summary s where s.id=t.id),0)=0;
  select count(*) into v_old_hru from public.unified_tags t
   where t.status='active' and coalesce(t.human_reviewed,false)=true
     and coalesce((select usage_count from public.tag_usage_summary s where s.id=t.id),0)=0;

  if (v->>'active_zero_usage')::bigint <> v_old_azu then
    raise exception 'P5 failed: active_zero_usage % <> old correlated form %', v->>'active_zero_usage', v_old_azu;
  end if;
  if (v->>'human_reviewed_unused')::bigint <> v_old_hru then
    raise exception 'P5 failed: human_reviewed_unused % <> old correlated form %', v->>'human_reviewed_unused', v_old_hru;
  end if;

  -- P6: facet_coverage must not have been zeroed by the unpinning. A view whose
  --     predicate silently started returning NULL would read as "no facets",
  --     which is the kind of clean-looking zero this repo keeps paying for.
  if coalesce((v->>'facet_coverage')::bigint, 0) <= 0 then
    raise exception 'P6 failed: facet_coverage is %, expected a positive count', v->>'facet_coverage';
  end if;
  if coalesce(jsonb_typeof(v->'facets'), 'null') <> 'object' then
    raise exception 'P6 failed: facets is not an object (%)', jsonb_typeof(v->'facets');
  end if;

  raise notice 'tag_ontology_health: % ms, facet_coverage=%, active_zero_usage=%, human_reviewed_unused=%',
    v_ms, v->>'facet_coverage', v->>'active_zero_usage', v->>'human_reviewed_unused';
end $verify$;

commit;
