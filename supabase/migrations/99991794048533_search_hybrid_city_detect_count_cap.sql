-- search_hybrid: stop counting every venue in a city just to learn whether there are ten.
--
-- The `qcity` CTE (added by 99991793759708) decides whether an n-gram of the
-- query names a city, and requires that city to hold >= 10 venues before it is
-- treated as one. It computed that with a full
--   (select count(*) from search_documents v where v.entity_type='venue' and lower(v.city)=lower(c.title))
-- which is an Index Scan (not index-only) over every venue row in the city, and
-- the planner evaluates it twice per candidate (once in the >= 10 filter, once
-- in the ORDER BY). Measured on prod 2026-11-06 for "leather bar madrid":
-- 662 venue rows per pass, 1,300 heap visits, 280 ms of an 828 ms call
-- (cold); 339 ms on a second run.
--
-- The filter only needs to know whether the count reaches 10, so the count is
-- capped with a LIMIT 10 subquery. The ORDER BY used the full count as a
-- tie-breaker after name length; the count depends only on the city NAME, so
-- two candidates with the same name always tied anyway, and two different
-- names of equal length that both hold >= 10 venues now tie at 10 and fall to
-- a new, deterministic `z.cname` tie-breaker instead of venue volume.
--
-- Verified in a session-local copy of the function against the live one, on
-- eight queries (gay sauna barcelona, leather bar madrid, lesbian cafe paris,
-- queer bookshop london, trans support group lyon, drag berlin,
-- sauna rome open late, pride amsterdam august): identical `total` and
-- identical top-10 doc_ids on all eight; the copy ran in 9-128 ms where the
-- live function took 80-1,356 ms. (Old ran first in each pair, so part of the
-- gap is cache warming; the plan-level saving is the 280-340 ms above.)
--
-- Patched from pg_get_functiondef rather than restated, with each anchor
-- required to occur exactly once, so this cannot silently revert anything a
-- later migration changed in the rest of the body.

do $mig$
declare
  v_oid  oid := 'api_private.search_hybrid(text,extensions.vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)'::regprocedure;
  v_def  text := pg_get_functiondef(v_oid);
  v_from1 text := '(select count(*) from public.search_documents v where v.entity_type=''venue'' and lower(v.city)=lower(c.title)) n';
  v_to1   text := '(select count(*) from (select 1 from public.search_documents v where v.entity_type=''venue'' and lower(v.city)=lower(c.title) limit 10) v10) n';
  v_from2 text := 'order by length(z.cname) desc, z.n desc limit 1';
  v_to2   text := 'order by length(z.cname) desc, z.n desc, z.cname limit 1';
  v_n int;
begin
  if position(v_to1 in v_def) > 0 and position(v_to2 in v_def) > 0 then
    raise notice 'search_hybrid city-detect cap already applied; nothing to do';
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_from1, ''))) / length(v_from1);
  if v_n <> 1 then raise exception 'anchor 1 found % times, expected 1', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_from2, ''))) / length(v_from2);
  if v_n <> 1 then raise exception 'anchor 2 found % times, expected 1', v_n; end if;
  execute replace(replace(v_def, v_from1, v_to1), v_from2, v_to2);
end
$mig$;

do $verify$
declare
  v_src text;
  v_cfg text[];
begin
  select prosrc, proconfig into v_src, v_cfg from pg_proc
   where oid = 'api_private.search_hybrid(text,extensions.vector,text[],jsonb,double precision,double precision,double precision,timestamp with time zone,integer,integer,timestamp with time zone,timestamp with time zone,numeric,numeric,text)'::regprocedure;
  if position('limit 10) v10) n' in v_src) = 0 then raise exception 'P1 failed: capped venue count missing'; end if;
  if position('lower(v.city)=lower(c.title)) n' in v_src) > 0 then raise exception 'P2 failed: uncapped venue count still present'; end if;
  if position('z.n>=10' in v_src) = 0 then raise exception 'P3 failed: >= 10 venue threshold lost'; end if;
  if not ('plan_cache_mode=force_custom_plan' = any(v_cfg)) then raise exception 'P4 failed: function SET clause lost'; end if;
end
$verify$;
