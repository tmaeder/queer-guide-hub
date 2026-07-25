-- Geo spine: table-level grants (RLS already scopes rows; without these, PostgREST
-- returns 42501 for every role — caught by the prod e2e pass).
grant select on public.geo_places, public.geo_country_profiles, public.geo_city_profiles,
  public.geo_village_profiles, public.geo_landmark_profiles to anon, authenticated;
grant insert, update, delete on public.geo_places, public.geo_country_profiles,
  public.geo_city_profiles, public.geo_village_profiles, public.geo_landmark_profiles to authenticated;
grant all on public.geo_places, public.geo_country_profiles, public.geo_city_profiles,
  public.geo_village_profiles, public.geo_landmark_profiles, public.geo_spine_drift_log to service_role;
grant select on public.geo_spine_drift_log to authenticated;
grant select on public.geo_integrity_violations to authenticated;
