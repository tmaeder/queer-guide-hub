-- Partial index for the /venues featured-hero rotation.
--
-- useFeaturedVenues (src/hooks/useVenuesV2Data.ts) and the edge preload
-- (functions/_lib/venuesHeroPreload.ts) both run:
--
--   select … from venues
--    where is_featured and data_source <> 'refuge-restrooms'
--      and review_status <> 'archived' and duplicate_of_id is null
--      and images is not null
--    order by updated_at desc limit 12
--
-- With only idx_venues_updated_at to use, Postgres walks every venue newest
-- first and filters: measured on prod 2026-11-20 as anon, 120,456 rows removed
-- by filter, 114,283 buffers, 830 ms, to return 5 rows. That made the page's
-- own featured query slow on every /venues visit, and it made the edge
-- preload (800 ms timeout) fail on nearly every request, so it never emitted.
--
-- A partial index over the featured rows only is tiny (a handful of rows) and
-- serves the ORDER BY directly. The other predicates stay as filters; they
-- are cheap on a set this small.
--
-- Not CONCURRENTLY: migrations run in a transaction. The build scans venues
-- once under a SHARE lock (writes wait for it), which takes well under a second
-- for a partial index this size.
create index if not exists venues_featured_updated_at_idx
  on public.venues (updated_at desc)
  where is_featured and duplicate_of_id is null;

do $verify$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'venues'
       and indexname = 'venues_featured_updated_at_idx'
  ) then
    raise exception 'venues_featured_updated_at_idx was not created';
  end if;
end
$verify$;
