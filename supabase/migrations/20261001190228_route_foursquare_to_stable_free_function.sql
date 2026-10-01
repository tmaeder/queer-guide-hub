-- Keep the guarded Foursquare implementation on a stable slug. Older deploy
-- automation still publishes the legacy source-foursquare function name.
update public.ingestion_sources
   set edge_function = 'source-foursquare-free',
       updated_at = now()
 where slug in ('foursquare', 'foursquare-os');
