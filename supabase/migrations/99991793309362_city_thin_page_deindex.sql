-- A `real` city's seo_indexable was PRESERVED, never recomputed, so a city created
-- indexable stayed indexable forever and nothing ever reconsidered it. Measured on prod
-- 2026-10-29: the cities table has tripled to 19,628 rows (CLAUDE.md still records ~5,700),
-- 14,374 of them `nominatim-geocode` -- cities minted as a side effect of reverse-geocoding
-- venue and event addresses. 16,175 are indexable and 5,633 of those carry no Wikidata
-- identifier, which is what put CITY_IDENTITY_AMBIGUOUS 11x over its ceiling and reds
-- `Data Quality Gates` on every run.
--
-- The counter is telling the truth and must NOT be renegotiated away: of those 5,633,
-- 3,048 have exactly ONE venue or event and 2,989 of those have no description at all
-- (avg completeness 14/100); 4,815 have fewer than five items. That is thin content
-- published to crawlers.
--
-- Two arms, both the same class of blind spot in run_city_trust_recompute's `scope` CTE:
-- the row is only re-examined when it was itself written, and neither gaining nor failing
-- to gain children writes the city row.
--
--   1. THIN: deindex a city with fewer than 5 venues+events AND no description.
--      5+ items OR a description earns the page. Operator decision 2026-10-29.
--      Projected: 5,247 deindexed, indexable 16,175 -> 10,928,
--      CITY_IDENTITY_AMBIGUOUS 5,633 -> 934.
--
--   2. GHOST REGAINED: the mirror of the fillable-gap arm this function already carries.
--      Measured: 53 ghost cities have live children and 51 are unreachable by the three
--      existing scope arms, which is CITY_GHOST_HAS_LIVE_CHILDREN=53 against a ceiling
--      of 8. The `shell_status='ghost' -> true` restore already exists in `final`; it
--      simply never ran for them.
--
-- shell_status is deliberately NOT changed by the thin arm: a thin city HAS content, so it
-- is `real`. Routing it to ghost would inflate the very CITY_GHOST_HAS_LIVE_CHILDREN
-- counter arm 2 exists to drive to zero.
--
-- PATCHED from pg_get_functiondef, not restated: this body has evolved past its newest
-- migration file (its own comments cite 99991791920004) and a full restate would revert
-- whoever wrote that.
do $patch$
declare
  v_src text;
  v_out text;
  v_from text;
  v_to text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'run_city_trust_recompute';
  if v_src is null then raise exception 'run_city_trust_recompute not found'; end if;
  v_out := v_src;

  -- (1) scope must carry description, so `scored` can test it.
  v_from := E'           c.needs_attention, c.last_refreshed_at, c.updated_at, c.last_verified_at\n    FROM public.cities c';
  v_to   := E'           c.needs_attention, c.last_refreshed_at, c.updated_at, c.last_verified_at,\n           c.description\n    FROM public.cities c';
  if (length(v_out) - length(replace(v_out, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'patch 1 anchor not found exactly once';
  end if;
  v_out := replace(v_out, v_from, v_to);

  -- (2) two new re-open arms.
  v_from := E'WHERE e.city_id = c.id AND e.duplicate_of_id IS NULL)))';
  if (length(v_out) - length(replace(v_out, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'patch 2 anchor not found exactly once';
  end if;
  v_to := E'WHERE e.city_id = c.id AND e.duplicate_of_id IS NULL))\n'
    || E'           -- THIN-PAGE ARM. For a `real` city new_seo_indexable PRESERVED\n'
    || E'           -- seo_indexable, so a thin page created indexable was never\n'
    || E'           -- reconsidered. Re-open only while the classifier can close the very\n'
    || E'           -- condition that selected it (thin -> deindexed), so one pass resolves\n'
    || E'           -- it and the predicate is false for it ever after. The count is bounded\n'
    || E'           -- by LIMIT 5: this arm runs over every indexable description-less city.\n'
    || E'           OR (c.slug NOT LIKE ''tmp-%''\n'
    || E'               AND c.seo_indexable\n'
    || E'               AND (c.description IS NULL OR btrim(c.description) = '''')\n'
    || E'               AND (SELECT count(*) FROM (\n'
    || E'                      SELECT 1 FROM public.venues v\n'
    || E'                       WHERE v.city_id = c.id AND v.duplicate_of_id IS NULL\n'
    || E'                      UNION ALL\n'
    || E'                      SELECT 1 FROM public.events e\n'
    || E'                       WHERE e.city_id = c.id AND e.duplicate_of_id IS NULL\n'
    || E'                      LIMIT 5) t) < 5)\n'
    || E'           -- GHOST-REGAINED ARM, the exact mirror of the fillable-gap arm above:\n'
    || E'           -- GAINING the first venue or event never writes the city row either, so\n'
    || E'           -- a ghost that gained content was invisible to scope and stayed ghost +\n'
    || E'           -- deindexed. Measured 2026-10-29: 53 such cities, 51 of them unreachable\n'
    || E'           -- by the three arms above.\n'
    || E'           OR (c.shell_status = ''ghost''\n'
    || E'               AND (EXISTS (SELECT 1 FROM public.venues v\n'
    || E'                             WHERE v.city_id = c.id AND v.duplicate_of_id IS NULL)\n'
    || E'                 OR EXISTS (SELECT 1 FROM public.events e\n'
    || E'                             WHERE e.city_id = c.id AND e.duplicate_of_id IS NULL))))';
  v_out := replace(v_out, v_from, v_to);

  -- (3) scored computes is_thin.
  v_from := E'      (co.venues=0 AND co.events=0) AS is_empty';
  if (length(v_out) - length(replace(v_out, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'patch 3 anchor not found exactly once';
  end if;
  v_to := E'      (co.venues=0 AND co.events=0) AS is_empty,\n'
    || E'      ((co.venues + co.events) < 5\n'
    || E'        AND (s.description IS NULL OR btrim(s.description) = '''')) AS is_thin';
  v_out := replace(v_out, v_from, v_to);

  -- (4) final deindexes a thin page, BEFORE the ghost restore.
  v_from := E'           WHEN is_empty THEN false\n           WHEN shell_status = ''ghost'' THEN true';
  if (length(v_out) - length(replace(v_out, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'patch 4 anchor not found exactly once';
  end if;
  v_to := E'           WHEN is_empty THEN false\n'
    || E'           -- BEFORE the ghost restore, deliberately: a ghost that gains ONE venue\n'
    || E'           -- must not be republished thin.\n'
    || E'           WHEN is_thin THEN false\n'
    || E'           WHEN shell_status = ''ghost'' THEN true';
  v_out := replace(v_out, v_from, v_to);

  execute v_out;
end $patch$;

-- PART 2, the reason the gate could not recover even once the data was fixed.
--
-- `Data Quality Gates` reads api_private.city_quality_scorecard(), which returns a STORED
-- SNAPSHOT, not live data. The snapshot is written by run_city_quality_issue_sync, which
-- succeeded on 10-26, 10-27 and 10-28 and ERRORED on 10-29:
--
--   canceling statement due to statement timeout
--   CONTEXT: SQL function "city_description_is_wrong_subject"
--            SQL function "_city_quality_scorecard"
--            run_city_quality_issue_sync line 58
--
-- So the snapshot froze at 10-28 and the gate reads a regressed moment it can never leave.
-- Proven rather than inferred: patching the classifier and running it in a rolled-back
-- transaction moved indexable 16,175 -> 10,946 and ghost-with-children 53 -> 2 while EVERY
-- scorecard counter stayed byte-identical.
--
-- The cancel landed in city_description_is_wrong_subject but that function is NOT the cost.
-- Measured separately over all 12,443 descriptions (max length 1,274): all three of its
-- regex arms complete well inside 45s. The cost is _city_quality_scorecard as a whole --
-- measured at 43.4s on the tripled corpus -- and the cancel simply landed in whichever
-- frame was executing. Do not "optimise" that regex on the strength of the CONTEXT line.
--
-- 43.4s for a once-nightly aggregate over 19,628 cities is acceptable; the job inherits
-- pg_cron's ~120s and run_city_category_review_sync(10000) runs first, which is why it sat
-- on the edge and tipped over. A function-scoped timeout is one line and reverts in one
-- line, where rewriting a 43s multi-CTE aggregate is a large change with real regression
-- risk against the only writer of the snapshot the gate depends on.
--
-- ponytail: raises the ceiling rather than lowering the cost. If the scorecard approaches
-- 300s, profile _city_quality_scorecard by leaf node (buffers roll up through the plan
-- tree, so only a childless scan's number is its own) instead of raising this again.
alter function public.run_city_quality_issue_sync(integer) set statement_timeout = '300s';

do $verify$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='run_city_trust_recompute';

  if position('AS is_thin' in v_src) = 0 then raise exception 'P1 failed: is_thin not computed'; end if;
  if position('WHEN is_thin THEN false' in v_src) = 0 then raise exception 'P2 failed: is_thin does not deindex'; end if;
  -- ORDER is load-bearing: is_thin must be tested BEFORE the ghost restore, or a ghost
  -- gaining one venue is republished thin.
  if position('WHEN is_thin THEN false' in v_src) > position('WHEN shell_status = ''ghost'' THEN true' in v_src)
    then raise exception 'P3 failed: is_thin is tested AFTER the ghost restore'; end if;
  if position('c.shell_status = ''ghost''' in v_src) = 0 then raise exception 'P4 failed: ghost-regained arm missing from scope'; end if;
  if position('c.description' in v_src) = 0 then raise exception 'P5 failed: scope does not select description'; end if;
  -- shell_status must NOT gain a thin arm: a thin city has content and is `real`.
  if position(E'WHEN is_thin THEN ''ghost''' in v_src) > 0 then raise exception 'P6 failed: thin must not change shell_status'; end if;

  -- P7: the snapshot writer must carry a timeout above the measured 43.4s scorecard, or the
  -- gate reads a frozen snapshot forever and PART 1 is invisible to it.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='run_city_quality_issue_sync'
      and p.proconfig @> array['statement_timeout=300s']
  ) then raise exception 'P7 failed: run_city_quality_issue_sync has no raised statement_timeout'; end if;

  -- P8: the function must still EXECUTE. CREATE OR REPLACE only parses a plpgsql body, so a
  -- broken query inside it fails at CALL time, not here -- a clean db push proves nothing.
  perform public.run_city_trust_recompute(false);
end $verify$;
