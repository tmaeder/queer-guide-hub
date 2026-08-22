-- Backfill venues.platform_ids['google'] from the 2026-08-22 patroc import (PR #2940).
-- venue_sources rows with source_slug='patroc' and a numeric source_entity_id carry a
-- real Google Place ID at payload->'normalized'->'metadata'->>'google_place_id'
-- (ChIJ… ids scraped from patroc's map buttons). This unblocks the Amenity Truth
-- Engine's deferred Google Places source for these venues at zero resolution cost.
--
-- Rules: fill-if-empty only (platform_ids->>'google' must be null — measured 0 venues
-- had one); a venue reached by MULTIPLE distinct place ids is skipped, not guessed
-- (these are dedup-merge artifacts where two patroc listings collapsed into one venue;
-- measured 5 such venues while the 05:50 UTC dedup sweep was live). Provenance goes to
-- venue_field_provenance (UNIQUE (venue_id, field, source) makes this idempotent).
-- The venues UPDATE enqueues into search_reindex_queue via trg_search_documents_venue
-- (~2.6 ms/row post-overhaul), so ~750 rows is well inside the statement timeout.

with src as (
  select venue_id,
         payload->'normalized'->'metadata'->>'google_place_id' as pid
  from venue_sources
  where source_slug = 'patroc'
    and source_entity_id ~ '^[0-9]+$'
    and payload->'normalized'->'metadata'->>'google_place_id' ~ '^ChIJ[A-Za-z0-9_-]{10,}$'
),
unambiguous as (
  select venue_id, min(pid) as pid
  from src
  group by venue_id
  having count(distinct pid) = 1
),
updated as (
  update venues v
  set platform_ids = coalesce(v.platform_ids, '{}'::jsonb) || jsonb_build_object('google', u.pid)
  from unambiguous u
  where v.id = u.venue_id
    and v.platform_ids->>'google' is null
  returning v.id, u.pid
)
insert into venue_field_provenance (venue_id, field, value, source, confidence, is_winning)
select id, 'platform_ids.google', to_jsonb(pid), 'patroc', 0.95, true
from updated
on conflict (venue_id, field, source) do update
  set value = excluded.value,
      observed_at = now();
