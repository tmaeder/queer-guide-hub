-- Regression guard for search_hybrid. The function has lost the target_groups
-- filter (and its perf properties) several times to rewrites based on stale
-- copies across environments. assert_search_hybrid_contract() RAISES on the two
-- recurring regressions; it's invoked at the top of scripts/search-eval/run.mjs
-- (nightly + on-dispatch), so the eval goes red if either reappears. Run it
-- manually after any search_hybrid change: select public.assert_search_hybrid_contract();
create or replace function public.assert_search_hybrid_contract()
returns text language plpgsql stable security definer set search_path to 'public','extensions','pg_temp' as $$
declare def text; full_n int; filt_n int;
begin
  def := pg_get_functiondef('public.search_hybrid(text,vector,text[],jsonb,double precision,double precision,double precision,timestamptz,integer,integer)'::regprocedure);

  -- 1. target_groups filter must be present…
  if position('target_groups' in def) = 0 then
    raise exception 'search_hybrid contract FAIL: target_groups filter missing — re-add the jsonb ?| any-of clause (regressed at geo_soft_boost before).';
  end if;
  -- …and must actually narrow results.
  full_n := (public.search_hybrid('', null, array['venue'], '{}'::jsonb)->>'total')::int;
  filt_n := (public.search_hybrid('', null, array['venue'], jsonb_build_object('target_groups', jsonb_build_array('lesbian')))->>'total')::int;
  if not (filt_n > 0 and filt_n < full_n) then
    raise exception 'search_hybrid contract FAIL: target_groups filter not narrowing (lesbian=% of %).', filt_n, full_n;
  end if;

  -- 2. no vnn OR-subquery in the candidate admission (defeats the GIN bitmap → seq scan).
  if position('in (select doc_id from vnn)' in def) > 0 then
    raise exception 'search_hybrid contract FAIL: vnn admission via OR-subquery defeats the index (seq scan). Gather candidates in the kwvec UNION CTE instead.';
  end if;

  return format('ok: target_groups filter active (lesbian=%s of %s venues), no vnn seq-scan pattern', filt_n, full_n);
end $$;

grant execute on function public.assert_search_hybrid_contract() to authenticated, service_role, anon;
