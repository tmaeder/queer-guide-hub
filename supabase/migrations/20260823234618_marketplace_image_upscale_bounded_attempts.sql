-- Bound the retries, or the sweep never terminates.
--
-- The dead/blocked discriminator refuses to stamp a 403 unless the host answered
-- something in the SAME run. That is the right instinct — recording a block as
-- "no better copy exists" writes a merchant off permanently — but as the ONLY
-- rule it does not terminate here: roughly 99% of misterb's originals are
-- deleted, so a 60-listing batch usually contains no live file at all, nothing
-- corroborates, nothing is stamped, and the next run draws from the same 2,150.
-- Measured: a clean successful run, 134 misterb requests, 0 successes, 0
-- stamped, `remaining` unmoved.
--
-- So: keep refusing to judge on ONE failure, but count the failures. Three
-- unmeasurable visits and the row leaves the pool. Same terminal-sentinel shape
-- as the city-fields backfill's data_unavailable-after-3-attempts, for the same
-- reason — an exhausted row has to leave or it starves everything behind it.
--
-- `resolved_at` and `attempts >= 3` are different states on purpose: the first
-- means we looked and judged, the second means we could not look, three times.
-- Only the first is evidence about the image.
--
-- NOTE: the work-list body in this migration carried a three-valued-logic bug
-- (`NOT (jsonb ? key)` is NULL, not true, when the jsonb is NULL) which made it
-- return zero rows. Fixed in 20260823235254; that later definition wins, so this
-- file deliberately only ships the two stamp helpers.
CREATE OR REPLACE FUNCTION public.marketplace_note_image_upscale_attempt(p_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH upd AS (
    UPDATE public.marketplace_listings l
    SET attributes = COALESCE(l.attributes, '{}'::jsonb) || jsonb_build_object(
      'image_upscale',
      COALESCE(l.attributes->'image_upscale', '{}'::jsonb) || jsonb_build_object(
        'attempts', COALESCE((l.attributes->'image_upscale'->>'attempts')::int, 0) + 1,
        'last_attempt_at', now()
      )
    )
    WHERE l.id = ANY(p_ids)
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM upd;
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_note_image_upscale_attempt(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_note_image_upscale_attempt(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.marketplace_stamp_image_upscale(p_ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH upd AS (
    UPDATE public.marketplace_listings l
    SET attributes = COALESCE(l.attributes, '{}'::jsonb) || jsonb_build_object(
      'image_upscale',
      COALESCE(l.attributes->'image_upscale', '{}'::jsonb) || jsonb_build_object(
        'attempted_at', now(),
        'resolved_at', now()
      )
    )
    WHERE l.id = ANY(p_ids)
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM upd;
$fn$;

REVOKE ALL ON FUNCTION public.marketplace_stamp_image_upscale(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketplace_stamp_image_upscale(uuid[]) TO service_role;

-- Rows stamped before this migration used the bare `attempted_at` key with no
-- `resolved_at`. They WERE judged, so carry them over rather than making them
-- eligible again.
UPDATE public.marketplace_listings
SET attributes = attributes || jsonb_build_object(
  'image_upscale', (attributes->'image_upscale') || jsonb_build_object('resolved_at', attributes->'image_upscale'->>'attempted_at')
)
WHERE attributes->'image_upscale' ? 'attempted_at'
  AND NOT (attributes->'image_upscale' ? 'resolved_at');
