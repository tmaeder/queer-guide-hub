-- Archive the 2026-04-26 patroc scrape's events-misfiled-as-venues cohort.
--
-- venue_sources rows with source_slug='patroc' AND source_entity_id ~ '-n1$' are the
-- legacy scrape's keys; that scrape filed patroc EVENT listings ("Ibiza Gay Pride 2026",
-- "Churros con Chocolate", "Straßenfest") as venues. The 2026-08-22 re-import (PR #2940,
-- numeric source_entity_id) created proper events for the still-listed ones, so these
-- venue twins are pure junk. Measured 2026-08-22: 111 venues carry ONLY legacy '-n1'
-- patroc sources (zero corroborating other sources); 51 were already archived by earlier
-- sweeps (run_venue_event_demisfile 2026-06-18 + nonvenue dispositions), 60 were still
-- approved+indexable. None of the 60 has a website or phone; all are event listings
-- (year in title, pride/festival/party vocabulary, or a matching events.title).
--
-- Disposition (same reversible convention as run_venue_event_demisfile):
--   review_status='archived' + seo_indexable=false + needs_attention=true, with a
--   prev-state snapshot under enrichment_status.event_demisfile. Reversal = restore
--   prev_review_status/prev_seo_indexable and drop the key.
--
-- Seven cohort venues are NOT event-confirmed (city map/guide artifacts and party names
-- with no year, no event vocabulary, no events-table corroboration). Those stay live and
-- are flagged for human review via enrichment_status.nonvenue_candidate (the flag-only
-- shape from 20260914130100), never auto-archived.
--
-- Also clears the 3 events whose venue_id points INTO this cohort — name-era linker
-- artifacts pairing unrelated events with pseudo-venues ("Sleazy Madrid Winter Edition
-- 2023" → "Mad.Bear 2026"). prev_venue_id is kept in the event's enrichment_status.

with cohort as (
  select distinct vs.venue_id
  from venue_sources vs
  where vs.source_slug = 'patroc'
    and vs.source_entity_id like '%-n1'
    and not exists (
      select 1 from venue_sources o
      where o.venue_id = vs.venue_id
        and not (o.source_slug = 'patroc' and o.source_entity_id like '%-n1'))
),
-- Cohort rows with NO event confirmation: kept live, flagged below instead.
keep as (
  select unnest(array[
    '3cda9df9-dea5-4ab7-873b-326b2af5c62d',  -- Amsterdam Gay Maps (guide artifact)
    'a1612bb0-5426-48ee-bb0f-8386b39192f8',  -- Copenhagen Gay Map (guide artifact)
    '3b8af0dc-d68e-4eb7-ba52-9af816a32849',  -- Expressions Mixtes, Brussels
    '8443ac2e-dc5f-4f9c-b2be-11eb026b4869',  -- Drag Is Love, Copenhagen
    '06f9544b-edc0-4d61-990c-1c8f95e56752',  -- Queerpool, Hamburg (already duplicate_of)
    '9c10ca09-66ae-4636-9f18-7e3765b6d26e',  -- Chicha, Madrid
    'dfee2de1-76a2-4913-8b45-daf8240cdb0a'   -- andersrum ist nicht verkehrt, Vienna
  ]::uuid[]) as venue_id
),
to_archive as (
  select v.id, v.review_status, v.seo_indexable,
    jsonb_build_object(
      'cohort', 'patroc_legacy_n1_only',
      'has_year', v.name ~ '(19|20)[0-9]{2}',
      'has_event_vocab', v.name ~* '\m(pride|festival|fest|parade|csd|party|karneval|carnival|week|weekend|day|days|straßenfest|strassenfest|marathon|film|cup|tournament|contest|edition|presents|summit|market|run)\M',
      'event_title_match', exists (
        select 1 from events e
        where lower(e.title) = lower(v.name)
           or (e.city is not null and v.city is not null
               and lower(e.city) = lower(v.city)
               and lower(e.title) = lower(regexp_replace(v.name, '\s*(19|20)[0-9]{2}\s*$', '')))
      )
    ) as signals
  from venues v
  join cohort c on c.venue_id = v.id
  where v.review_status <> 'archived'
    and v.duplicate_of_id is null
    and v.id not in (select venue_id from keep)
)
update venues v
set review_status = 'archived',
    seo_indexable = false,
    needs_attention = true,
    enrichment_status = jsonb_set(
      coalesce(v.enrichment_status, '{}'::jsonb), '{event_demisfile}',
      jsonb_build_object(
        'prev_review_status', a.review_status,
        'prev_seo_indexable', a.seo_indexable,
        'reason', 'patroc legacy -n1 key: event listing imported as venue (2026-04-26 scrape); event twin exists post-PR #2940',
        'signals', a.signals,
        'at', now()))
from to_archive a
where v.id = a.id;

-- Flag the unconfirmed residue for human review (flag-only, reversible by dropping the key).
update venues v
set needs_attention = true,
    enrichment_status = jsonb_set(
      coalesce(v.enrichment_status, '{}'::jsonb), '{nonvenue_candidate}',
      jsonb_build_object(
        'reason', 'patroc_legacy_event_listing_key',
        'status', 'review',
        'source', 'patroc_legacy_n1'))
where v.id in (
    '3cda9df9-dea5-4ab7-873b-326b2af5c62d',
    'a1612bb0-5426-48ee-bb0f-8386b39192f8',
    '3b8af0dc-d68e-4eb7-ba52-9af816a32849',
    '8443ac2e-dc5f-4f9c-b2be-11eb026b4869',
    '06f9544b-edc0-4d61-990c-1c8f95e56752',
    '9c10ca09-66ae-4636-9f18-7e3765b6d26e',
    'dfee2de1-76a2-4913-8b45-daf8240cdb0a')
  and v.review_status <> 'archived'
  and not (coalesce(v.enrichment_status, '{}'::jsonb) ? 'nonvenue_candidate');

-- Unlink events wrongly attached to cohort pseudo-venues (3 rows measured 2026-08-22).
with cohort as (
  select distinct vs.venue_id
  from venue_sources vs
  where vs.source_slug = 'patroc'
    and vs.source_entity_id like '%-n1'
    and not exists (
      select 1 from venue_sources o
      where o.venue_id = vs.venue_id
        and not (o.source_slug = 'patroc' and o.source_entity_id like '%-n1'))
)
update events e
set venue_id = null,
    enrichment_status = jsonb_set(
      coalesce(e.enrichment_status, '{}'::jsonb), '{venue_link_cleared}',
      jsonb_build_object(
        'prev_venue_id', e.venue_id,
        'reason', 'venue_id pointed at a patroc event-listing pseudo-venue (archived by 20260915150000)',
        'at', now()))
where e.venue_id in (select venue_id from cohort);
