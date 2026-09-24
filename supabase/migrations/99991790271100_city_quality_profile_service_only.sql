-- The raw profile contains operational issue detail and was discoverable to
-- every signed-in account through GraphQL. Admins consume the guarded
-- city_quality_scorecard() RPC instead, whose private core reads this view as
-- its definer. Keep the view itself service-only.
revoke all on public.city_quality_profile from authenticated;
grant select on public.city_quality_profile to service_role;

do $verify$
begin
  if has_table_privilege('authenticated', 'public.city_quality_profile', 'select') then
    raise exception 'authenticated must not select city_quality_profile directly';
  end if;

  if not has_table_privilege('service_role', 'public.city_quality_profile', 'select') then
    raise exception 'service_role must retain city_quality_profile access';
  end if;
end
$verify$;
