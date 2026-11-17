-- Recovered from production migration history. Already applied; do not renumber.
-- Recorded statement digest (MD5): 77373e062ad7249e1f591b114feb3036
-- This service-role-only batch RPC can finish in ~3s with a custom plan but
-- still hits authenticator's inherited 8s budget under concurrent cron load.
-- PostgREST hoists this function setting before executing the RPC. Keep the
-- exception local, finite, and below the worker's 120s HTTP request budget.
alter function public.claim_event_gaps(text,uuid,integer,uuid[],boolean)
  set statement_timeout = '20s';
notify pgrst, 'reload schema';
;

