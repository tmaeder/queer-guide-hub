-- Trust-&-safety audit 2026-06-05, finding M-3: ~82% of events lacked a
-- timezone, breaking "open now"/scheduling correctness.
--
-- Conservative backfill: set event.timezone from the country's primary IANA
-- zone ONLY for single-timezone countries. Multi-zone countries (US, CA, BR,
-- AU, RU, …) are excluded because countries.timezone holds just the capital
-- zone, which would be wrong for events elsewhere in the country — those need
-- coordinate-based tz resolution (deferred). Idempotent: only fills NULLs.

WITH multizone AS (
  SELECT unnest(ARRAY[
    'US','CA','BR','AU','RU','MX','ID','KZ','MN','CD',
    'CL','EC','PT','ES','GL','KI','FM','PF','AR','MY'
  ]) AS code
)
UPDATE events e
SET timezone = c.timezone
FROM countries c
WHERE e.country_id = c.id
  AND e.duplicate_of_id IS NULL
  AND (e.timezone IS NULL OR e.timezone = '')
  AND c.timezone IS NOT NULL AND c.timezone <> ''
  AND c.code NOT IN (SELECT code FROM multizone);
