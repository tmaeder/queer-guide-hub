-- Profession facets RPC for the /personalities filter bar.
-- Returns top-N professions with counts, excluding adult performers from the default
-- public browse (users can opt in via the More Filters drawer).

CREATE OR REPLACE FUNCTION public.get_personality_profession_facets(lim int DEFAULT 20)
RETURNS TABLE (profession text, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TRIM(p.profession) AS profession,
    COUNT(*)::bigint AS cnt
  FROM public.personalities p
  WHERE p.visibility = 'public'
    AND p.profession IS NOT NULL
    AND p.profession <> ''
    AND p.profession NOT ILIKE '%adult performer%'
    AND p.profession NOT ILIKE '%adult model%'
    AND p.profession NOT ILIKE '%adult film%'
    AND p.profession NOT ILIKE '%porn%'
  GROUP BY TRIM(p.profession)
  ORDER BY COUNT(*) DESC, TRIM(p.profession) ASC
  LIMIT GREATEST(lim, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_personality_profession_facets(int) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_personalities_profession_public
  ON public.personalities (profession)
  WHERE visibility = 'public';
