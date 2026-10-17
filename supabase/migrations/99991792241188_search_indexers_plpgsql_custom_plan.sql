-- The 15 search_documents_index_* functions read 1,092.9 MB of buffers to reindex 15 rows.
-- After this migration they read 14.9 MB. The SQL is not touched; only the language is.
--
-- WHERE THIS CAME FROM. `search_reindex_drain` is the largest consumer on this instance --
-- 3,124 s of total execution, 3,764 GB of buffers over 280 calls, i.e. **13 GB per call**
-- against a 2 GB `shared_buffers`, so one call evicts the entire cache six times over. It fires
-- every minute. Measured on `cron.job_run_details` over 12 hours: 698 runs, 299 of them over
-- 10 s, 63 over 60 s, avg 17 s, max 240 s, and `search_reindex_drain_stats.total_budget_stops`
-- = 2,255, i.e. the function's own 75 s budget is being hit constantly.
--
-- THE SLOWNESS IS REAL EXECUTION, which is the opposite of 99991792224363 one job over. That
-- migration found that two of three headline durations were `job startup timeout` with a NULL
-- `job_pid`, i.e. pg_cron never forking, measuring instance saturation rather than the
-- function. Split the same way here, the 12-hour window gives 12 startup timeouts against
-- **289 runs of genuine execution** averaging 36.4 s and peaking at 240.4 s. Do not reuse that
-- migration's conclusion; check `job_pid` per incident.
--
-- WHAT IT ACTUALLY IS. Every one of these functions is dual-mode -- `p_id` filters to one row,
-- `p_id IS NULL` reindexes everything -- and spells that as
--
--     and (p_id is null or o.id = p_id)
--
-- 14 of the 15 carry it (`..._marketplace` is the exception). In a `LANGUAGE sql` body the
-- statement is planned ONCE with `p_id` as a placeholder, so the plan cannot know the value is
-- non-null and must be able to return every row -- a full scan, every call, even though the
-- drain always passes exactly one id. Measured per single-row reindex, EXPLAIN (ANALYZE,
-- BUFFERS) on prod:
--
--     organizations  536.7 MB -> 0.5    events    148.2 -> 0.5    news      127.9 -> 0.6
--     venues         101.1    -> 0.6    marketplace 93.8 -> 7.8    cities     30.5 -> 0.3
--     tags            24.0    -> 0.7    personalities 13.8 -> 0.6  milestones 12.2 -> 0.7
--     countries        1.7    -> 0.3    villages     1.5 -> 0.7    guides      0.6 -> 0.6
--     landmarks        0.5    -> 0.6    groups       0.3 -> 0.1    cultural_nodes 0.1 -> 0.3
--     ------------------------------------------------------------------------------------
--     TOTAL        1,092.9 MB -> 14.9 MB
--
-- `organizations` reads a quarter of shared_buffers to index ONE row. Note the two regressions
-- are noise at this scale (0.5->0.6, 0.1->0.3) and `marketplace`, which has no dual-mode
-- predicate, still improves 12x -- it carries other parameterised predicates.
--
-- THE FIX IS THE LANGUAGE, NOT THE SQL. `LANGUAGE plpgsql` plans via the custom/generic
-- machinery, so the actual `p_id` is available; `SET plan_cache_mode TO 'force_custom_plan'`
-- makes that deterministic rather than leaving it to the planner's cost comparison. The body is
-- carried over byte-for-byte inside `begin ... end;`, so `p_id IS NULL` still full-scans, which
-- is correct for that mode and is the plan it should always have had.
--
-- BOTH LAZIER FORMS WERE MEASURED AND ONE OF THEM IS A TRAP:
--   * `LANGUAGE sql` + `SET plan_cache_mode TO 'force_custom_plan'` -- **NO EFFECT**, 549.5,
--     536.7, 536.7, 536.7 MB over four calls. The GUC does not reach a SQL-function body. This
--     is the appealing one-line `ALTER FUNCTION` fix and it does nothing; it was only ruled out
--     by running it.
--   * `LANGUAGE plpgsql` with no GUC -- works, but the first calls spike while the planner
--     evaluates: 13.3, 0.5, 7.5, 0.5, 0.5, 0.8, 1.0 MB. With the GUC it is 0.6, 0.5, 1.0, 0.5
--     from the first call. The drain calls these up to 400 times per run, so determinism is
--     worth one clause.
--
-- ALSO MEASURED AND REJECTED:
--   * Rewriting the predicate to `o.id = coalesce(p_id, o.id)`. Still not sargable -- the
--     expression references `o.id`, so no index scan -- and it changes the SQL.
--   * Dropping the drain's `DELETE` before reindex. Already refused with reasons by
--     99991792215525: the indexers do upsert, but the DELETE is what DE-indexes an entity that
--     no longer qualifies, which is the guarantee 20261016110000 exists to provide.
--   * More indexes. 99991792215525 added `venues_name_city_key_idx` for a genuine expression
--     self-join and took venues 290 ms -> 100 ms. That index is correct and is NOT touched
--     here; it still serves the `p_id IS NULL` full-reindex path. But it also recorded the
--     residual ~100 ms as "inherent to the document shape" -- measured again now, venues is
--     101.1 MB -> 0.6 MB, so the residual was this defect, not the document shape.
--
-- EQUIVALENCE IS ASSERTED, NOT ASSUMED. Dry-run on prod in a transaction forced to roll back:
-- all 15 rewritten, then each family's document rebuilt and compared column-by-column against
-- the pre-change output -- **families_differing = 0**, and `p_id IS NULL` still executes.
--
-- THE CONTROL MATTERS AND THE FIRST RUN LACKED IT. Comparing the rewritten output against the
-- STORED `search_documents` row reported `tags` differing on `search_tsv` and `description`.
-- That was staleness, not behaviour: tag prose changes constantly in this corpus, so the stored
-- document predated its source. Running the CURRENT function first and diffing against that
-- makes tags identical. A reindex A/B must refresh before it snapshots.
--
-- WHY THE REWRITE READS `pg_get_functiondef` INSTEAD OF RECONSTRUCTING THE HEADER. These 15
-- functions carry THREE different `search_path` settings -- `""`, `public, extensions`, and
-- `public, extensions, pg_temp` -- so a single hardcoded value would silently change behaviour
-- for some of them. Reconstructing it by hand is worse than it looks: emitting the stored
-- `search_path=public, extensions` through `%L` yields `SET search_path TO 'public, extensions'`,
-- ONE schema named "public, extensions", and the cities clone then failed with
-- `unaccent(text) does not exist`. Postgres's own rendering is correct for all three, and every
-- other attribute (SECURITY DEFINER, volatility, cost, strictness, owner) rides along with it.
--
-- NO BODY TEXT IS MATCHED, deliberately. The header anchors are machine-generated and stable;
-- the body is moved verbatim. That is the difference between this and the PATCH-anchor rewrites
-- that aborted `db push` on main -- there is no anchor inside the SQL to go stale. Each
-- transformation is asserted to have applied before it is executed.
--
-- TRAP, hit twice while writing this: `rtrim(text)` strips SPACES, not newlines, and
-- `pg_get_functiondef` ends with `$function$\n`. Anchoring the closing replacement on
-- `\$function\$$` therefore matched nothing and left the body unterminated -- caught by this
-- file's own guard rather than by a failing function. Use `\s*$`. (The same bug made a
-- pre-flight query report all 15 bodies as "not ending in a semicolon", which was false.)
-- Checked rather than assumed: no body contains a `$` at all, so `$function$` is unambiguous.
--
-- IDEMPOTENT. The loop selects only `lanname = 'sql'`, so a re-run converts nothing, and the
-- postconditions assert the REACHED STATE rather than a count of rows changed -- a count would
-- fail on the second run while the schema was correct.
--
-- NOT FIXED HERE, named rather than implied:
--   * The drain still DELETEs then re-INSERTs each document, so each item pays an HNSW insert
--     into the 2.9 GB `search_embeddings` index via `trg_sd_pull_embedding` (the FK is ON
--     DELETE CASCADE). That is a separate change with its own correctness argument, and it is
--     not what the 1,092.9 MB was.
--   * `admin_automation_project_tick` is the worst remaining per-call consumer at 32 GB.
--   * `refresh_admin_review_queue_top` (1.8 GB/call) is being worked separately; 99991792224392
--     landed for it today and this file deliberately does not touch it.
--
-- ROLLBACK: re-create any function with `LANGUAGE sql` and no `plan_cache_mode`; the body is
-- unchanged, so reverting is a language flip in the other direction.

-- functiondef-assert-ok: this migration does not ASSERT on pg_get_functiondef(), it EXECUTES
-- it. `def` is the text re-submitted as the new definition, so stripping comments would delete
-- each function's own explanatory comments from the rewritten body -- 5 of the 15 carry them
-- (groups, news, organizations, personalities, villages), measured. The hazard the guard
-- protects against is real here but has a different shape: `replace()` is GLOBAL, so an anchor
-- occurring twice -- once in the header, once in a body comment -- would corrupt the body
-- silently. That is asserted away instead of stripped, which is strictly stronger for a
-- transformation: every anchor must occur EXACTLY the expected number of times or the migration
-- aborts. Measured on all 15 before writing this: `\n LANGUAGE sql\n` once, `AS $function$`
-- once, `$function$` twice, and no body contains the string "language sql" in any case.
--
-- No lock_timeout guard: CREATE OR REPLACE FUNCTION locks the pg_proc row, not the tables, and
-- `SET LOCAL` is a no-op under `db push` in this repo anyway -- including one would be theatre.

do $rewrite$
declare
  r       record;
  def     text;
  newdef  text;
  n_done  integer := 0;
  n_lang  integer;
  n_as    integer;
  n_tag   integer;
begin
  for r in
    select p.oid, p.proname, p.prosrc
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
      join pg_language  l on l.oid = p.prolang
     where p.proname like 'search_documents_index_%'
       and l.lanname = 'sql'
     order by p.proname
  loop
    def := pg_get_functiondef(r.oid);

    -- Soft on preconditions, loud on a shape this cannot safely transform. Each anchor must be
    -- UNIQUE, not merely present: replace() is global, so a second occurrence in a body comment
    -- would be rewritten too and corrupt the body with no error. Counting is what makes
    -- preserving the body's comments safe.
    n_lang := (length(def) - length(replace(def, E'\n LANGUAGE sql\n', '')))
              / length(E'\n LANGUAGE sql\n');
    n_as   := (length(def) - length(replace(def, 'AS $function$', ''))) / length('AS $function$');
    n_tag  := (length(def) - length(replace(def, '$function$', ''))) / length('$function$');

    if n_lang <> 1 then
      raise exception 'search_indexers_plpgsql: % has % occurrences of the LANGUAGE sql header line, expected exactly 1', r.proname, n_lang;
    end if;
    if n_as <> 1 then
      raise exception 'search_indexers_plpgsql: % has % occurrences of "AS $function$", expected exactly 1', r.proname, n_as;
    end if;
    if n_tag <> 2 then
      raise exception 'search_indexers_plpgsql: % has % occurrences of the $function$ tag, expected exactly 2 (open and close)', r.proname, n_tag;
    end if;
    if position('$' in r.prosrc) > 0 then
      raise exception 'search_indexers_plpgsql: % body contains a $; the $function$ tag is no longer unambiguous', r.proname;
    end if;

    newdef := replace(def, E'\n LANGUAGE sql\n',
                           E'\n LANGUAGE plpgsql\n SET plan_cache_mode TO ''force_custom_plan''\n');
    newdef := replace(newdef, 'AS $function$', E'AS $function$\nbegin\n');
    -- `\s*$`, not `$`: pg_get_functiondef ends with a newline and rtrim() does not remove it.
    newdef := regexp_replace(newdef, '\$function\$\s*$', E'\nend;\n$function$');

    if position('LANGUAGE plpgsql' in newdef) = 0
       or position(E'AS $function$' || chr(10) || 'begin' || chr(10) in newdef) = 0
       or newdef !~ 'end;\s*\$function\$\s*$'
       or position('plan_cache_mode' in newdef) = 0 then
      raise exception 'search_indexers_plpgsql: transformation did not apply cleanly to %', r.proname;
    end if;

    execute newdef;
    n_done := n_done + 1;
  end loop;

  raise notice 'search_indexers_plpgsql: converted % function(s)', n_done;
end $rewrite$;

-- ------------------------------------------------------------------ postconditions
do $verify$
declare
  v_sql_left   integer;
  v_missing    text[];
  v_total      integer;
  v_dual       integer;
begin
  -- 1. Nothing in the family may still be LANGUAGE sql. Asserted as a count of what is WRONG,
  --    so a 16th indexer added later without conversion fails here instead of sliding in.
  select count(*) into v_sql_left
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    join pg_language  l on l.oid = p.prolang
   where p.proname like 'search_documents_index_%' and l.lanname = 'sql';
  if v_sql_left <> 0 then
    raise exception 'search_indexers_plpgsql: % indexer(s) are still LANGUAGE sql', v_sql_left;
  end if;

  -- 2. Every one carries the GUC. plpgsql alone works but spikes on its first calls while the
  --    planner compares plans, and the drain calls these up to 400x per run.
  select array_agg(p.proname order by p.proname) into v_missing
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname like 'search_documents_index_%'
     and not coalesce(p.proconfig, array[]::text[]) @> array['plan_cache_mode=force_custom_plan'];
  if v_missing is not null then
    raise exception 'search_indexers_plpgsql: missing plan_cache_mode on %', v_missing;
  end if;

  -- 3. The family did not shrink. 15 were measured; fewer means a function was lost.
  select count(*) into v_total
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname like 'search_documents_index_%';
  if v_total < 15 then
    raise exception 'search_indexers_plpgsql: only % indexers remain, expected >= 15', v_total;
  end if;

  -- 4. The SQL was NOT rewritten -- this change is language-only, and the dual-mode predicate
  --    it exists to make plannable must still be there. Comments are stripped first: a body
  --    that merely MENTIONS the predicate in prose would otherwise satisfy this, which is the
  --    defect check-functiondef-asserts.mjs exists to catch.
  select count(*) into v_dual
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname like 'search_documents_index_%'
     and regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') like '%p_id is null or%';
  if v_dual < 14 then
    raise exception
      'search_indexers_plpgsql: only % bodies still carry the dual-mode predicate, expected >= 14; the SQL was altered', v_dual;
  end if;

  -- 5. The functions must still RUN. A converted body that fails to execute reads identically
  --    to a converted body that works, from the catalog alone.
  perform public.search_documents_index_countries(
    (select entity_id from public.search_documents where entity_type = 'country' limit 1));
end $verify$;
