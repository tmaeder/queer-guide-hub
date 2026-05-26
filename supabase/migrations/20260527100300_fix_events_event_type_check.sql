-- The events_event_type_check constraint was missing 'exhibition', 'comedy', 'cruise'
-- which were present in the admin CMS dropdown, causing all saves with those types to fail.
-- Expanded to the full set now used by the frontend.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_type_check;

ALTER TABLE public.events ADD CONSTRAINT events_event_type_check
  CHECK (lower(event_type) = ANY (ARRAY[
    'party', 'festival', 'pride', 'fetish', 'community', 'meetup',
    'conference', 'workshop', 'concert', 'film', 'drag', 'sports',
    'art', 'theater', 'fundraiser', 'protest', 'social', 'fair',
    'exhibition', 'comedy', 'cruise', 'other'
  ]));
