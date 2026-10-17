-- get_admin_review_queue(): push a per-branch top-N into the handful of branches that
-- carry essentially all the rows, for p_scope='all' with no filters.
--
-- WHY THERE IS ANYTHING LEFT TO DO HERE. 99991792213011 pushed the `decisions` scope
-- predicate down into each branch and measured 2,488 -> 1,182 ms. Its own header named
-- what it deliberately did NOT fix: `all`, whose cost is the union and the sort rather
-- than the join. That header also predicted the shape of this change wrongly in two
-- ways, and both corrections are the substance of this file -- see MEASURED, below.
--
-- WHAT THE PUSHDOWN IS. The function builds one `select ... from public.<view> u` per
-- registered source, `union all`s all 41 of them, and only then filters, sorts and takes
-- a page. So every branch is fully materialised on every call: 319,921 rows produced to
-- return 50. A global top-N over a UNION ALL equals the union of the per-branch top-Ns
-- when the ordering is a single total order applied identically to every branch, so each
-- branch may be wrapped as
--     (select * from ( <branch> ) b order by <same keys> limit v_size*v_page)
-- and the outer ORDER BY then sees at most 41*limit rows instead of 319,921.
--
-- SOUND ONLY FOR p_scope='all', AND THAT IS NOT A CONVENIENCE. The scope predicate is
-- applied AFTER the union, in `filtered`. Limiting a branch BEFORE that filter would
-- discard rows the filter would have kept -- scope='safety' would take each branch's
-- oldest 50 and then keep only the safety rows among them, which can be none while the
-- branch holds plenty further down. Only scope='all' has a `true` predicate, so only
-- there is the pre-filter limit equivalent. The filter arguments are excluded for a
-- second, independent reason: with any of them set, `total` is reported as
-- `count(*) from filtered`, which a per-branch limit would silently make wrong.
--
-- THE BRANCH KEY MUST BE THE GLOBAL KEY RESTRICTED TO THE BRANCH, which is why the
-- emitted ORDER BY is concrete per sort mode rather than the outer query's
-- `case when $4='priority' then ... end` ladder. Those CASEs are opaque to the planner,
-- and -- more importantly -- `urgency_rank`, `priority_weight` and `queue_type` are
-- per-branch literals from the registry, so Postgres folds them away inside a branch and
-- the surviving keys are exactly what each mode names here:
--   priority   -> urgency_rank desc, overdue desc, priority_weight desc, created_at, queue_type, id
--   age        -> created_at, queue_type, id
--   confidence -> confidence_score, created_at, queue_type, id
-- `overdue` is recomputed inline from the branch's own literal `sla_hours` because it is
-- derived in the outer `authorized` CTE and does not exist as a branch column. The key is
-- a TOTAL order (it ends in `id`), so there is no tie ambiguity for the theorem to fall
-- through. Verified: all three modes generate SQL that parses and plans, and an
-- end-to-end run of p_sort='age' returned byte-identical item ids, `total` and
-- `all_total` against an unpatched copy of the function in the same transaction.
--
-- MEASURED, and the first correction: THE WRAPPER MAKES A SMALL BRANCH WORSE. Blocks for
-- the whole 41-branch union, EXPLAIN (ANALYZE, BUFFERS), service_role:
--     unwrapped            222,989 blocks   0 sorts   1,758 ms planning
--     every branch wrapped 197,768 blocks  41 sorts     815 ms planning
--     gated (this file)    197,762 blocks   3 sorts     158 ms planning
-- Wrapping all 41 and gating to 3 reach the SAME block total, so the 38 small branches
-- contribute nothing but 38 sorts and five times the planning time. The arithmetic
-- decomposes exactly: the dominant branch saves 67,874 blocks while the other 40 get
-- 42,653 blocks MORE expensive when wrapped, netting the 25,221 that both variants show.
-- A limit on a branch of a few hundred rows buys no early exit and costs a plan the
-- planner would not otherwise have chosen.
--
-- Hence the count gate, which is the second correction: 99991792213011 expected the
-- lever to be per-SORT (it predicted the pushdown would be "actively WORSE for
-- p_sort='confidence'"). It is not -- measured per branch, `confidence` is the CHEAPEST
-- mode, because that view's confidence_score is a constant NULL, so the key folds and
-- leaves created_at, which an index serves. The real lever is per-BRANCH SIZE. Rows are
-- extremely concentrated: business-quality 258,052 (80.7%), event-quality 35,062 (11.0%),
-- general-review 24,362 (7.6%) -- 99.2% cumulative -- then geography at 1,869 and a tail
-- of 37 sources at 294 rows or fewer. A threshold anywhere between ~2,000 and ~24,000
-- selects the same three branches; 10,000 sits in that gap.
--
-- The gate reads `admin_review_queue_counts`, the cache the function already joins for
-- its `counts` CTE, and it FAILS SAFE: `coalesce(qc.n,0) > 10000` means a missing or
-- not-yet-computed count leaves the branch unwrapped, i.e. exactly today's behaviour.
--
-- STATED RATHER THAN IMPLIED: this is 11.3% of the blocks, and it does NOT bring the
-- call under the 3s/8s per-role statement_timeout ceilings on its own. The dominant cost
-- is producing 319,921 rows from three large views on every request, and the remaining
-- levers are a materialised queue or a product decision about whether ~258k machine
-- completeness findings belong in a human review queue at all. Neither is this change.
--
-- PATCHED, NOT RESTATED, via pg_get_functiondef with exactly-once anchors. The live body
-- is not what any single repo file says: 99991792213011 is in flight against the same
-- two string_agg calls, so a CREATE OR REPLACE built from a file would silently revert
-- it. All three anchors here are chosen to be form-independent -- each matches the text
-- both before and after that migration, because it changes the format ARGUMENTS and this
-- one wraps the format CALL and extends the FROM clause. The two never fire on the same
-- branch either: its predicate is scope='decisions', this one's is scope='all'.

do $patch$
declare
  v_src  text;
  v_new  text;
  a_decl text := $ad$ v_search text; v_union text; v_details text;$ad$;
  a1     text;
  a2     text;
  a3     text;
  r1     text;
  n      integer;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'get_admin_review_queue';
  if v_src is null then
    raise exception 'P0 failed: public.get_admin_review_queue() does not exist';
  end if;

  -- Anchor 1: the head of the v_union string_agg. Untouched by 99991792213011.
  a1 := $a1$
 select string_agg(format(
  'select u.id,u.queue_type,$a1$;

  -- Anchor 2: the tail of that same string_agg. Deliberately does NOT include the paren
  -- that closes format(), so the replacement can sit between format() and the separator
  -- whatever arguments 99991792213011 has added in between.
  a2 := $a2$,' union all ' order by r.queue_key),
 string_agg(format($a2$;

  -- Anchor 3: the FROM clause the two string_aggs draw their registry rows from.
  a3 := $a3$ into v_union,v_details from public.admin_review_sources r where r.active and ($a3$;

  r1 := $r1$
 v_topn := p_scope='all' and p_queue_types is null and p_content_types is null and v_search is null;
 if v_topn then
  v_pre := '(select * from (';
  v_post := format(') b order by %s limit %s)', case p_sort
    when 'priority' then 'urgency_rank desc,(sla_hours is not null and created_at<now()-make_interval(hours=>sla_hours)) desc,priority_weight desc,created_at asc nulls last,queue_type,id'
    when 'confidence' then 'confidence_score asc nulls last,created_at asc nulls last,queue_type,id'
    else 'created_at asc nulls last,queue_type,id' end, v_size::bigint*v_page);
 else v_pre := ''; v_post := ''; end if;
 select string_agg(case when coalesce(qc.n,0)>10000 then v_pre else '' end||format(
  'select u.id,u.queue_type,$r1$;

  -- Each anchor exactly once, or refuse. A replace() that matches twice would wrap the
  -- details union too; one that matches zero times would ship a no-op reporting success.
  n := (length(v_src) - length(replace(v_src, a_decl, ''))) / length(a_decl);
  if n <> 1 then raise exception 'P0 failed: declare anchor matched % times, expected 1 (body shape changed -- re-read pg_get_functiondef before editing this file)', n; end if;
  n := (length(v_src) - length(replace(v_src, a1, ''))) / length(a1);
  if n <> 1 then raise exception 'P0 failed: union-head anchor matched % times, expected 1', n; end if;
  n := (length(v_src) - length(replace(v_src, a2, ''))) / length(a2);
  if n <> 1 then raise exception 'P0 failed: union-tail anchor matched % times, expected 1', n; end if;
  n := (length(v_src) - length(replace(v_src, a3, ''))) / length(a3);
  if n <> 1 then raise exception 'P0 failed: registry-FROM anchor matched % times, expected 1', n; end if;

  v_new := replace(v_src, a_decl, a_decl || $z$ v_pre text; v_post text; v_topn boolean;$z$);
  v_new := replace(v_new, a1, r1);
  v_new := replace(v_new, a2, $z$||case when coalesce(qc.n,0)>10000 then v_post else '' end$z$ || a2);
  v_new := replace(v_new, a3, $z$ into v_union,v_details from public.admin_review_sources r left join public.admin_review_queue_counts qc on qc.queue_key=r.queue_key where r.active and ($z$);

  if v_new = v_src then
    raise exception 'P0 failed: patch was a no-op';
  end if;

  execute v_new;
end $patch$;

-- Arms a ceiling for the behavioural postcondition below. set_config(...,true) applies to
-- the SUBSEQUENT statements of this transaction, never to the statement it runs in -- a
-- statement_timeout is armed when a statement starts, which is why this cannot live
-- inside the verify block and why a file-level `set local` would be discarded by db push.
do $arm$ begin perform set_config('statement_timeout', '25s', true); end $arm$;

do $verify$
declare
  v_src  text;
  v_cnt  integer;
  v_res  jsonb;
  s      text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'get_admin_review_queue';

  -- P1: the wrapper, the gate and the counts join are all present.
  if position($z$left join public.admin_review_queue_counts qc$z$ in v_src) = 0 then
    raise exception 'P1 failed: the counts join the size gate reads is absent';
  end if;
  v_cnt := (select count(*) from regexp_matches(v_src, $z$coalesce\(qc\.n,0\)>10000$z$, 'g'));
  if v_cnt <> 2 then
    raise exception 'P1 failed: expected the size gate twice (prefix and suffix), found %', v_cnt;
  end if;
  if position($z$'(select * from ('$z$ in v_src) = 0 then
    raise exception 'P1 failed: the branch wrapper prefix is absent';
  end if;

  -- P2: the pushdown is gated on scope AND on every filter argument. Dropping any one of
  -- these is the defect that returns a wrong page or a wrong `total`, and each reads as
  -- a harmless simplification.
  for s in select unnest(array[
      $z$p_scope='all'$z$,
      $z$p_queue_types is null$z$,
      $z$p_content_types is null$z$,
      $z$v_search is null$z$]) loop
    if position(s in v_src) = 0 then
      raise exception 'P2 failed: the top-N gate no longer tests %', s;
    end if;
  end loop;

  -- P3: the branch ORDER BY still names the keys of all three sort modes. A mode whose
  -- key silently drops to created_at would page in the wrong order, with every other
  -- check here still passing.
  for s in select unnest(array[
      $z$urgency_rank desc,(sla_hours is not null$z$,
      $z$priority_weight desc,created_at asc nulls last$z$,
      $z$confidence_score asc nulls last,created_at asc nulls last$z$]) loop
    if position(s in v_src) = 0 then
      raise exception 'P3 failed: branch ordering lost %', s;
    end if;
  end loop;

  -- P4: nothing above may have cost the function its gate or its definer settings.
  if position($z$Review queue requires a staff account$z$ in v_src) = 0 then
    raise exception 'P4 failed: the staff-role gate is gone';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname='public' and p.proname='get_admin_review_queue'
       and p.prosecdef and p.provolatile='s'
       and p.proconfig @> array['search_path=public, pg_temp']
  ) then
    raise exception 'P4 failed: SECURITY DEFINER / STABLE / search_path did not survive';
  end if;

  -- P5: BEHAVIOURAL, because a CREATE OR REPLACE only parses a plpgsql body -- a broken
  -- generated query raises on the first CALL and nothing above can see it.
  --
  -- ONE sort mode, not three, and the bound is the reason. This call materialises the
  -- whole union; measured at 35 active backends it ran 94s, so three would put 75s of
  -- ceiling-waiting into db push over someone else's traffic. One call proves the
  -- generated query is valid SQL, and the three modes differ only in the ORDER BY text
  -- that P3 pins -- all three were verified to parse and plan during development.
  --
  -- 57014 is carved out and NOT treated as a defect: parsing and planning happen before
  -- execution, so a syntax error raises long inside the 25s ceiling, while a timeout can
  -- only mean the instance is loaded. Failing on it would abort db push for the repo.
  perform set_config('request.jwt.claims', '{"user_role":"admin"}', true);
  begin
    select public.get_admin_review_queue(null,null,null,'priority',1,50,'all') into v_res;
    if v_res is null or not (v_res ? 'items') then
      raise exception 'P5 failed: scope=all returned no items key';
    end if;
    -- With no filters, scope=all reports `total` from the counts cache rather than from
    -- `filtered`, so the per-branch limit must not have moved it.
    if (v_res->>'total') is distinct from (v_res->>'all_total') then
      raise exception 'P5 failed: scope=all broke the total=all_total contract (% vs %)',
        v_res->>'total', v_res->>'all_total';
    end if;
  exception
    when query_canceled then
      raise notice 'P5: hit the 25s ceiling; parse+plan succeeded, execution unverified under load';
  end;

  raise notice 'P1-P5 passed';
end $verify$;
