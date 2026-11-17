-- Recovered from production migration history. Already applied; do not renumber.
-- Recorded statement digest (MD5): 05fe84f7e1cf8b70ae13e6180ff93b23
-- The cached generic plan cannot specialize image/content eligibility or the
-- optional UUID filter. A real generic enrollment plan took 8.8s, exceeding
-- the worker's statement timeout; the same custom plan took 0.83s.
-- Scope the setting to this function and restore the caller's setting on exit.
alter function public.claim_event_gaps(text,uuid,integer,uuid[],boolean)
  set plan_cache_mode = 'force_custom_plan';
;

