-- tag_hygiene_stats(): aggregate tag assignments BEFORE joining, and dedupe
-- raw event tag strings BEFORE normalising them.
--
-- WHY. The Critical data-quality gate timed out on this function twice in one
-- afternoon (2026-11-08), retry included. Measured on prod that day it took
-- 2.4-3.7s per call against the 8s PostgREST ceiling, up from ~1.4s when it was
-- last measured: unified_tag_assignments has grown to ~498k rows (264k at the
-- time of 70000101100000).
--
-- WHERE THE TIME WENT (EXPLAIN ANALYZE + plain-clock timing, same day):
--   uta_rollup  ~41% of the call. A hash join probe plus
--               lower(btrim(entity_type)) on every one of ~498k rows, while
--               the inputs are tiny: ~10k distinct tag_id, a handful of
--               distinct entity_type. Grouping by (tag_id, entity_type) first
--               does the per-row work on a few thousand groups instead:
--               760-980 ms -> 190-306 ms, identical counts.
--   event_tag_strings_unresolved: ~100k raw tag strings over 46k events reduce
--               to ~205 distinct values, but lower(btrim()) ran on all of them.
--               Deduping the raw strings first runs it on the distinct set.
--
-- EQUIVALENCE, not assumed:
--   * NULL tag_id: one group, no join match, counted as non_active — as before.
--   * NULL entity_type: `<>` is NULL either way, never counted — as before.
--   * btrim(r) <> '' filters the same strings whether applied before or after
--     the raw dedupe, because it is a function of the raw string.
--   A copy of the patched function was run against the live one on prod in
--   one session, alternating, 3 runs each: one distinct jsonb across all six,
--   old 1908-2953 ms, new 1364-1842 ms.
--
-- PATCHED, NOT RESTATED, per 99991790719601: the live body is not what any
-- repo file says, so this rewrites two exact anchors in pg_get_functiondef()
-- and refuses to run if either is not present exactly once. The function body
-- lives in api_private since the public one became a thin wrapper.
--
-- unified_tag_assignments is still read exactly twice (uta_groups, ev_assign)
-- and events exactly once (ev), which tagHygieneStats.test.ts and the verify
-- block below both hold.

do $patch$
declare
  v_fn   regprocedure := 'api_private.tag_hygiene_stats()'::regprocedure;
  v_src  text;
  v_code text;
  v_new  text;
  v_old1 text := E'  uta_rollup as materialized (\n    select count(*) as total,\n           count(*) filter (where t.id is null) as non_active,\n           count(*) filter (where a.entity_type <> lower(btrim(a.entity_type))) as nonclean\n      from unified_tag_assignments a\n      left join active t on t.id = a.tag_id\n  ),';
  v_new1 text := E'  uta_groups as materialized (\n    select tag_id, entity_type, count(*) as n\n      from unified_tag_assignments\n     group by tag_id, entity_type\n  ),\n  uta_rollup as materialized (\n    select coalesce(sum(g.n), 0)::bigint as total,\n           coalesce(sum(g.n) filter (where t.id is null), 0)::bigint as non_active,\n           coalesce(sum(g.n) filter (where g.entity_type <> lower(btrim(g.entity_type))), 0)::bigint as nonclean\n      from uta_groups g\n      left join active t on t.id = g.tag_id\n  ),';
  v_old2 text := E'select distinct lower(btrim(t)) as s\n          from ev, unnest(coalesce(tags, \'{}\'::text[])) t\n         where btrim(t) <> \'\'';
  v_new2 text := E'select distinct lower(btrim(r)) as s\n          from (select distinct t as r from ev, unnest(coalesce(tags, \'{}\'::text[])) t) raw\n         where btrim(r) <> \'\'';
begin
  v_code := regexp_replace(pg_get_functiondef(v_fn), '--[^' || chr(10) || ']*', '', 'g');
  if position('uta_groups as materialized' in v_code) > 0 then
    raise notice 'tag_hygiene_stats: already groups assignments first — no-op';
    return;
  end if;
  -- Raw text, comments included: replace() must act on exactly what executes.
  v_src := pg_get_functiondef(v_fn);
  if (length(v_src) - length(replace(v_src, v_old1, ''))) / length(v_old1) <> 1 then
    raise exception 'tag_hygiene_stats: uta_rollup anchor not found exactly once — re-derive from pg_get_functiondef()';
  end if;
  if (length(v_src) - length(replace(v_src, v_old2, ''))) / length(v_old2) <> 1 then
    raise exception 'tag_hygiene_stats: event-string anchor not found exactly once — re-derive from pg_get_functiondef()';
  end if;
  v_new := replace(replace(v_src, v_old1, v_new1), v_old2, v_new2);
  execute v_new;
end
$patch$;

do $verify$
declare
  v_code text;
  v_cfg  text[];
  v_j    jsonb;
begin
  v_code := regexp_replace(pg_get_functiondef('api_private.tag_hygiene_stats()'::regprocedure),
                           '--[^' || chr(10) || ']*', '', 'g');
  if position('uta_groups as materialized' in v_code) = 0
     or position('select distinct t as r from ev' in v_code) = 0 then
    raise exception 'P1 failed: the patch did not land';
  end if;
  if (select count(*) from regexp_matches(v_code, 'from\s+unified_tag_assignments\M', 'g')) <> 2
     or (select count(*) from regexp_matches(v_code, 'from\s+events\M', 'g')) <> 1 then
    raise exception 'P2 failed: hot-table read count changed';
  end if;
  select proconfig into v_cfg from pg_proc where oid = 'api_private.tag_hygiene_stats()'::regprocedure;
  if not (v_cfg @> array['enable_indexonlyscan=off', 'work_mem=48MB']) then
    raise exception 'P3 failed: function settings were lost: %', v_cfg;
  end if;
  v_j := api_private.tag_hygiene_stats();
  if v_j is null or not (v_j ? 'assignment_to_non_active_tag' and v_j ? 'event_tag_strings_unresolved'
                         and (v_j -> 'totals') ? 'assignments') then
    raise exception 'P4 failed: the function no longer returns its keys: %', left(v_j::text, 200);
  end if;
end
$verify$;
