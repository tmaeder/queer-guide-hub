-- Persist profile_completion_percentage.
--
-- The column existed but nothing ever wrote it: calculateCompletion() runs only
-- client-side, so AdminUsers and every DB consumer always read the default 0.
-- This adds a BEFORE INSERT/UPDATE trigger that computes the column in SQL,
-- mirroring the JS weighting in src/types/profileForm.ts (keep the two in sync):
--   core   50% — display_name, pronouns, location, languages, avatar_url
--   signal 40% — interests, travel_preferences, accessibility_needs, bio
--   extras 10% — first_name, occupation
-- A BEFORE trigger sets NEW on the same row, so there is no extra write storm.

-- Pure scorer over a profiles row (0-100). IMMUTABLE: reads only the passed row.
CREATE OR REPLACE FUNCTION public.compute_profile_completion_score(p public.profiles)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  WITH flags AS (
    SELECT
      ARRAY[
        (p.display_name IS NOT NULL AND length(btrim(p.display_name)) > 0),
        (p.pronouns IS NOT NULL AND length(btrim(p.pronouns)) > 0),
        (p.location IS NOT NULL AND length(btrim(p.location)) > 0),
        (p.languages IS NOT NULL AND p.languages NOT IN ('null'::jsonb, '{}'::jsonb, '[]'::jsonb)),
        (p.avatar_url IS NOT NULL AND length(btrim(p.avatar_url)) > 0)
      ] AS core,
      ARRAY[
        (p.interests IS NOT NULL AND p.interests NOT IN ('null'::jsonb, '{}'::jsonb, '[]'::jsonb)),
        (p.travel_preferences IS NOT NULL AND p.travel_preferences NOT IN ('null'::jsonb, '{}'::jsonb, '[]'::jsonb)),
        (CASE WHEN jsonb_typeof(p.travel_preferences -> 'accessibility_needs') = 'array'
              THEN jsonb_array_length(p.travel_preferences -> 'accessibility_needs') > 0
              ELSE false END),
        (p.bio IS NOT NULL AND length(btrim(p.bio)) > 0)
      ] AS signal,
      ARRAY[
        (p.first_name IS NOT NULL AND length(btrim(p.first_name)) > 0),
        (p.occupation IS NOT NULL AND length(btrim(p.occupation)) > 0)
      ] AS extras
  )
  SELECT round(
      (SELECT count(*) FILTER (WHERE x) FROM unnest(core) x)::numeric / array_length(core, 1) * 50
    + (SELECT count(*) FILTER (WHERE x) FROM unnest(signal) x)::numeric / array_length(signal, 1) * 40
    + (SELECT count(*) FILTER (WHERE x) FROM unnest(extras) x)::numeric / array_length(extras, 1) * 10
  )::int
  FROM flags;
$$;

CREATE OR REPLACE FUNCTION public.trg_profile_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.profile_completion_percentage := public.compute_profile_completion_score(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_completion_recompute ON public.profiles;
CREATE TRIGGER profile_completion_recompute
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profile_completion();

-- One-time backfill of the orphaned column (only rows whose value actually changes).
UPDATE public.profiles p
SET profile_completion_percentage = public.compute_profile_completion_score(p)
WHERE profile_completion_percentage IS DISTINCT FROM public.compute_profile_completion_score(p);
