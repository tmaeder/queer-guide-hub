-- release_gate_checks_raw reads these small safety projections across the full
-- content population. Wide heap scans took 10.1s for this arm alone and the
-- complete RPC took 16.5s, exceeding its existing 8s statement timeout. Cover
-- the original predicates without changing any safety decision or gate limit.
set lock_timeout='2s';

set statement_timeout='2min';

create index if not exists release_gate_venues_geography_cover_idx
 on public.venues(city_id,country_id,safety_gated,category) include(id)
 where duplicate_of_id is null;

-- The organization safety calculation also checks whether its primary venue
-- is gated. This is the exact native membership predicate, including duplicates.
create index if not exists release_gate_venues_safety_membership_idx
 on public.venues(id) where duplicate_of_id is null and safety_gated is true;

create index if not exists release_gate_events_geography_cover_idx
 on public.events(city_id,country_id,safety_gated);

create index if not exists release_gate_organizations_geography_cover_idx
 on public.organizations(city_id,country_id,safety_gated) include(primary_venue_id);
