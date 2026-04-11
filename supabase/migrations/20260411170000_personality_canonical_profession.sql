-- Canonicalize profession labels so the filter chip row collapses common
-- variants ("actor", "film actor", "television actor", "voice actor" -> "Actor")
-- without mutating the underlying free-text column.
--
-- Labels are chosen so that a simple ILIKE '%label%' against the raw column
-- still finds all rows in the canonical bucket (the hook's existing chip-click
-- behavior). Compromise picked over adding a server-side RPC filter.

CREATE OR REPLACE FUNCTION public.canonical_profession(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p IS NULL OR BTRIM(p) = '' THEN NULL
    WHEN lower(BTRIM(p)) ~ '(film|television|stage|voice|movie|theatre|theater) *(actor|actress)'
      OR lower(BTRIM(p)) IN ('actor','actress') THEN 'Actor'
    WHEN lower(BTRIM(p)) IN ('singer','vocalist','pop singer') THEN 'Singer'
    WHEN lower(BTRIM(p)) IN ('singer-songwriter','songwriter') THEN 'Singer-songwriter'
    WHEN lower(BTRIM(p)) ~ '(lgbtq|lgbt|gay|queer|trans|human rights|women''?s rights) rights? activist'
      OR lower(BTRIM(p)) IN ('activist','rights activist') THEN 'Activist'
    WHEN lower(BTRIM(p)) IN ('writer','novelist','author','essayist') THEN 'Writer'
    WHEN lower(BTRIM(p)) IN ('poet') THEN 'Poet'
    WHEN lower(BTRIM(p)) IN ('journalist','columnist','reporter') THEN 'Journalist'
    WHEN lower(BTRIM(p)) IN ('politician','statesman','stateswoman','diplomat') THEN 'Politician'
    WHEN lower(BTRIM(p)) IN ('drag queen','drag king','drag performer') THEN 'Drag queen'
    WHEN lower(BTRIM(p)) IN ('film director','director','movie director') THEN 'Director'
    WHEN lower(BTRIM(p)) IN ('composer','orchestral composer','music composer') THEN 'Composer'
    WHEN lower(BTRIM(p)) IN ('musician','instrumentalist','pianist','guitarist','drummer','bassist') THEN 'Musician'
    WHEN lower(BTRIM(p)) IN ('comedian','stand-up comedian','humorist') THEN 'Comedian'
    WHEN lower(BTRIM(p)) IN ('photographer','photojournalist') THEN 'Photographer'
    WHEN lower(BTRIM(p)) IN ('model','fashion model','supermodel') THEN 'Model'
    WHEN lower(BTRIM(p)) IN ('painter','visual artist','sculptor','artist') THEN 'Artist'
    WHEN lower(BTRIM(p)) IN ('researcher','scientist','biologist','chemist','physicist') THEN 'Researcher'
    WHEN lower(BTRIM(p)) IN ('screenwriter','scenarist') THEN 'Screenwriter'
    WHEN lower(BTRIM(p)) IN ('fashion designer','designer','stylist') THEN 'Fashion designer'
    WHEN lower(BTRIM(p)) IN ('rapper','hip hop artist') THEN 'Rapper'
    ELSE INITCAP(BTRIM(p))
  END;
$$;

GRANT EXECUTE ON FUNCTION public.canonical_profession(text) TO anon, authenticated;

-- Rewrite the facets RPC to bucket on canonical_profession. Splits the raw
-- comma-separated profession into its first token before canonicalizing, since
-- the scraper often concatenates several titles into one string.
CREATE OR REPLACE FUNCTION public.get_personality_profession_facets(lim int DEFAULT 20)
RETURNS TABLE (profession text, cnt bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT public.canonical_profession(
      split_part(p.profession, ',', 1)
    ) AS profession
    FROM public.personalities p
    WHERE p.visibility = 'public'
      AND p.profession IS NOT NULL
      AND p.profession <> ''
      AND p.profession NOT ILIKE '%adult performer%'
      AND p.profession NOT ILIKE '%adult model%'
      AND p.profession NOT ILIKE '%adult film%'
      AND p.profession NOT ILIKE '%porn%'
  )
  SELECT profession, COUNT(*)::bigint AS cnt
  FROM base
  WHERE profession IS NOT NULL
  GROUP BY profession
  ORDER BY COUNT(*) DESC, profession ASC
  LIMIT GREATEST(lim, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_personality_profession_facets(int) TO anon, authenticated;
