-- Contract tests for 20261001035336_foursquare_free_data_foundation.sql.
-- Run on a migrated non-production database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/foursquare_free_data.sql
-- The transaction rolls back the temporary current-month allowance row.

begin;

do $$
declare
  v_month date := date_trunc('month', current_date)::date;
  v_result jsonb;
  v_health jsonb;
begin
  assert exists (
    select 1 from pg_class
     where oid = 'public.foursquare_api_budget'::regclass
       and relrowsecurity
  ), 'foursquare_api_budget must have RLS enabled';
  assert exists (
    select 1 from pg_class
     where oid = 'public.foursquare_categories'::regclass
       and relrowsecurity
  ), 'foursquare_categories must have RLS enabled';
  assert not has_table_privilege('anon', 'public.foursquare_api_budget', 'select'),
    'anon must not read the provider budget';
  assert not has_table_privilege('authenticated', 'public.foursquare_sync_state', 'select'),
    'authenticated users must not read internal sync state';
  assert has_function_privilege(
    'service_role', 'public.reserve_foursquare_api_calls(text,integer)', 'execute'
  ), 'service role must be able to reserve calls';
  assert not has_function_privilege(
    'anon', 'public.reserve_foursquare_api_calls(text,integer)', 'execute'
  ), 'anon must not reserve calls';

  insert into public.foursquare_api_budget(
    month_start, call_limit, safety_margin, calls_used, by_purpose
  ) values (v_month, 5, 2, 0, '{}'::jsonb)
  on conflict (month_start) do update set
    call_limit = excluded.call_limit,
    safety_margin = excluded.safety_margin,
    calls_used = excluded.calls_used,
    by_purpose = excluded.by_purpose;

  v_result := public.reserve_foursquare_api_calls('contract-test', 3);
  assert v_result ->> 'allowed' = 'true', 'three calls inside the free ceiling must reserve';
  assert (v_result ->> 'remaining')::integer = 0, 'reservation must consume available headroom';

  v_result := public.reserve_foursquare_api_calls('contract-test', 1);
  assert v_result ->> 'allowed' = 'false', 'reservation above the safety ceiling must fail';
  assert v_result ->> 'reason' = 'free_tier_exhausted', 'denial reason must be explicit';
  assert (select calls_used from public.foursquare_api_budget where month_start = v_month) = 3,
    'a denied reservation must not increment usage';

  v_health := public.foursquare_data_health();
  assert v_health ? 'api_budget', 'health payload must include budget state';
  assert v_health ? 'sync_streams', 'health payload must include OS sync state';
  assert (v_health #>> '{api_budget,calls_used}')::integer = 3,
    'health payload must expose current usage';
end;
$$;

rollback;
