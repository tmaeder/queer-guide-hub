-- Pride subtypes (parade / week / festival / party / rally / community) for events.
-- The admin event form and the public events page both expose a pride sub-kind
-- selector, but the values were being written into a non-existent `events.tags`
-- column (SELECT tags FROM events -> 42703), so they never persisted. Store them
-- in a dedicated multi-valued column scoped to pride events instead of polluting
-- the unified tag taxonomy with pseudo-tags.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS pride_subtypes text[];

COMMENT ON COLUMN public.events.pride_subtypes IS
  'Pride event sub-kinds (e.g. pride:parade, pride:week). Multi-valued; only set when event_type = pride.';

-- GIN index so the public events page can filter with array overlap (&&).
CREATE INDEX IF NOT EXISTS events_pride_subtypes_gin
  ON public.events USING gin (pride_subtypes);
