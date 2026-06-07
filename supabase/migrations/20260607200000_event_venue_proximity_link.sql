-- P3: link events to venues by precise-coordinate proximity.
-- Most events carry no venue_name (P0 already exact-matched the 132 that did), so
-- the only remaining signal is location. Link each unlinked event that has a
-- PRECISE coord (not a P0 city-centroid backfill) to its NEAREST same-city venue
-- within 50m. Tight radius + nearest-only keeps dense-district mismatches down;
-- venue_id is reversible if a link is wrong. Events with no venue within 50m stay
-- null (genuinely not at a catalogued venue).

with cand as (
  select e.id as event_id, v.id as venue_id
  from public.events e
  cross join lateral (
    select vv.id
    from public.venues vv
    where vv.city_id = e.city_id
      and vv.latitude is not null and vv.longitude is not null
      and vv.duplicate_of_id is null
      and extensions.ST_DWithin(
            extensions.ST_MakePoint(e.longitude, e.latitude)::extensions.geography,
            extensions.ST_MakePoint(vv.longitude, vv.latitude)::extensions.geography, 50)
    order by extensions.ST_MakePoint(e.longitude, e.latitude)::extensions.geography
          <-> extensions.ST_MakePoint(vv.longitude, vv.latitude)::extensions.geography
    limit 1
  ) v
  where e.duplicate_of_id is null
    and e.venue_id is null
    and e.latitude is not null and e.longitude is not null
    and e.city_id is not null
    and not exists (
      select 1 from public.cities c
      where c.id = e.city_id and c.latitude = e.latitude and c.longitude = e.longitude
    )
)
update public.events e
set venue_id = cand.venue_id
from cand
where e.id = cand.event_id;

select public.run_event_completeness_recompute();
