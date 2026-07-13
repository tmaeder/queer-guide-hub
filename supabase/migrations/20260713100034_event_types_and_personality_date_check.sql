-- 1) Bring the events.event_type CHECK in line with the frontend option list
--    (src/lib/eventTypes.ts). 'comedy' and 'exhibition' were selectable in the
--    admin form but rejected by the DB — the whole save failed, which read as
--    "my event fields don't save" (same class as the earlier missing 'cruise').
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE public.events ADD CONSTRAINT events_event_type_check
  CHECK ((lower(event_type) = ANY (ARRAY[
    'party','festival','pride','fetish','community','meetup','conference',
    'workshop','concert','film','drag','sports','art','theater','fundraiser',
    'protest','social','fair','cruise','comedy','exhibition','other'
  ]::text[])));

-- 2) Personality date sanity (feedback: a personality had birth == death day).
--    Data verified clean before adding (0 violations).
ALTER TABLE public.personalities ADD CONSTRAINT personalities_birth_before_death_check
  CHECK (birth_date IS NULL OR death_date IS NULL OR death_date > birth_date);
