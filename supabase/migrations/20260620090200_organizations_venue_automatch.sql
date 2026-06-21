-- Auto-link venues to organizations by exact website domain — the physical-presence
-- overlap (a shop/outlet that is also a venue). Reusable + idempotent so it can be
-- scheduled later as new venues/orgs appear.

create or replace function public.run_link_orgs_to_venues_by_domain()
returns integer language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_linked integer;
begin
  with matches as (
    select v.id as venue_id, o.id as org_id,
           row_number() over (partition by v.id order by o.created_at) as rn
    from public.venues v
    join public.organizations o
      on lower(v.website_domain) = lower(o.website_domain)
    where v.website_domain is not null and v.website_domain <> ''
      and v.organization_id is null
      and v.duplicate_of_id is null
      and o.status = 'active'
      and lower(v.website_domain) not in (
        'facebook.com','instagram.com','twitter.com','x.com','linktr.ee',
        'google.com','linkedin.com','youtube.com','tiktok.com','wa.me')
  )
  update public.venues v
  set organization_id = m.org_id
  from matches m
  where v.id = m.venue_id and m.rn = 1;
  get diagnostics v_linked = row_count;

  -- Promote orgs that now have a venue: add the 'venue' role + a primary venue.
  with vg as (
    select organization_id as org_id,
           (array_agg(id order by coalesce(quality_score,0) desc, name))[1] as best_venue
    from public.venues
    where organization_id is not null and duplicate_of_id is null
    group by organization_id
  )
  update public.organizations o
  set roles = (select array(select distinct unnest(o.roles || array['venue']))),
      primary_venue_id = coalesce(o.primary_venue_id, vg.best_venue)
  from vg
  where o.id = vg.org_id
    and (not (o.roles @> array['venue']) or o.primary_venue_id is null);

  return v_linked;
end $$;

grant execute on function public.run_link_orgs_to_venues_by_domain() to service_role;

select public.run_link_orgs_to_venues_by_domain();
