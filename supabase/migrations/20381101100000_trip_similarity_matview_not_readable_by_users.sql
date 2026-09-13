-- `mv_trip_similarity_inputs` is SELECTable by `authenticated` and a MATERIALIZED VIEW CANNOT
-- CARRY RLS. Its columns are:
--
--   trip_id | owner_id | primary_country_id | primary_country_code | city_ids[] | season
--           | duration_days | start_date | end_date
--
-- So any logged-in account could `GET /rest/v1/mv_trip_similarity_inputs` and read WHICH USER is
-- travelling to WHICH COUNTRY AND CITIES on WHICH EXACT DATES. On this platform that is not an
-- ordinary IDOR: the whole safety-gating layer (20260623160000) exists on the premise that
-- associating a person with a destination is sensitive, and it gates VENUES in criminalizing
-- countries behind login while this matview handed over the actual TRIPS of real users to anyone
-- with an account. start_date/end_date additionally says when someone's home is empty.
--
-- Live exposure today is small -- 7 rows over 3 distinct owners -- but the grant is wrong by
-- construction and scales with adoption, which is the reason to close it now rather than after.
--
-- THE GRANT IS ALSO UNNECESSARY, which is what makes this a clean revoke rather than a redesign.
-- The matview has exactly one consumer, `get_similar_trip_suggestions`, and it is SECURITY
-- DEFINER: it runs with the definer's privileges and does not need the CALLER to hold SELECT.
-- Verified before writing this:
--   * no application code reads the matview -- the only repo hits are generated types.ts entries;
--   * the RPC returns ONLY aggregates (entity_type, entity_id, weight, trips_count). It never
--     projects owner_id, start_date or end_date, so the recommendation feature keeps working and
--     no per-user field is reachable through it either.
--
-- The two other API-exposed matviews were checked in the same pass and are deliberately LEFT
-- ALONE -- they carry no user data and are legitimately public:
--   personality_profession_facets   profession | cnt
--   tag_usage_summary               tag id/name/slug/category + content counts

revoke select on public.mv_trip_similarity_inputs from authenticated;
revoke select on public.mv_trip_similarity_inputs from anon;

do $$
begin
  if has_table_privilege('authenticated', 'public.mv_trip_similarity_inputs'::regclass, 'SELECT')
     or has_table_privilege('anon', 'public.mv_trip_similarity_inputs'::regclass, 'SELECT') then
    raise exception 'mv_trip_similarity_inputs is still directly readable by an API role';
  end if;

  -- The feature must survive the revoke. A SECURITY DEFINER function is unaffected by a grant on
  -- its underlying relation, but assert it rather than assume: if this function were ever changed
  -- to SECURITY INVOKER, the revoke above would silently break trip suggestions instead.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_similar_trip_suggestions' and p.prosecdef
  ) then
    raise exception 'get_similar_trip_suggestions is not SECURITY DEFINER -- revoking SELECT would break trip suggestions';
  end if;
end $$;
