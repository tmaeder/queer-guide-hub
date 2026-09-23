-- A merged city is still published, at its own URL, declaring itself canonical.
--
-- `cities` is the ONLY entity in this repo with no `<type>_slug_redirects`
-- table -- venues, events, personalities, countries, hotels, villages, news,
-- milestones, guides, orgs, marketplace listings and brands and tags all have
-- one; cities do not. So `SLUG_REDIRECT_KINDS` in functions/_lib/detail.ts has
-- no `city` entry, and `resolveSlugRedirect` can never answer for a city.
--
-- That makes `cityDetail`'s own comment FALSE. It reads:
--   "'merged' is left to resolveSlugRedirect, which turns it into a 301 --
--    a redirect is better than a 404 when a canonical row exists"
-- There is nothing for it to resolve through. `cityDetail` skips only `ghost`,
-- so a merged row is fetched and rendered like any other city.
--
-- MEASURED ON PROD WITH A GOOGLEBOT UA (2026-09-23), against a nonsense-slug
-- control that correctly 404s:
--   /city/antwerpen        -> HTTP 200, <title>LGBTQ+ guide to Antwerpen</title>,
--                             canonical = ITSELF, no robots meta
--   /city/bruessel         -> HTTP 200, canonical = itself
--   /city/city-of-rochester-> HTTP 200, canonical = itself
-- while /city/antwerp, /city/brussels and /city/rochester-us-6e3dn are the
-- survivors carrying the content. Each city is published TWICE and each copy
-- claims to be the canonical one.
--
-- SCOPE: 361 merged-away rows, of which 71 are `seo_indexable` (47 still
-- `shell_status='real'`, 24 already `'merged'`). `merge_cities` writes neither
-- column -- verified against the live body, which mentions `redirect` zero
-- times and `shell_status` zero times; the only thing it mints is a
-- `city_aliases` row.
--
-- A TRIGGER, NOT A PATCH TO merge_cities. `duplicate_of_id` has more writers
-- than the merge core -- the hand repairs in 20261119120000 and
-- 20261203100000 set it directly -- and this repo has already learned that
-- patching one writer leaves the others (the `review_status='approved'`
-- promotion lives in a trigger for exactly that reason). It is also the
-- smaller blast radius: restating `merge_cities` is the CREATE OR REPLACE trap
-- that this PR's sibling migration exists to repair.
--
-- UNSCOPED `BEFORE UPDATE`, not `BEFORE UPDATE OF duplicate_of_id`, matching
-- `resolve_entity_accessibility`: a column-scoped trigger fires on the columns
-- named in the STATEMENT rather than on what changed, and the guard below is
-- two null tests, so the cost of being unscoped is negligible against the cost
-- of missing a writer.
--
-- IT HANDLES BOTH DIRECTIONS. `unmerge_cities` exists and is the documented way
-- back, so a merge that cannot be undone cleanly is not reversible in practice:
-- the redirect is deleted on unmerge and the two flags are restored to the
-- values the row actually had, read back from `enrichment_status.merge_flags`
-- rather than guessed -- a row merged away from `placeholder` must not come
-- back as `real`.

-- ---------------------------------------------------------------- table
CREATE TABLE IF NOT EXISTS public.city_slug_redirects (
  old_slug   text        NOT NULL PRIMARY KEY,
  city_id    uuid        NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.city_slug_redirects IS
  'old_slug -> surviving city id, for a city merged away. Same shape as the '
  'twelve sibling <type>_slug_redirects tables; cities were the one entity '
  'without one, so a merged city served a self-canonical 200 forever. Written '
  'by trg_cities_zz_merge_redirect, read by resolveSlugRedirect.';

CREATE INDEX IF NOT EXISTS idx_city_slug_redirects_city ON public.city_slug_redirects(city_id);

ALTER TABLE public.city_slug_redirects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS city_slug_redirects_public_read ON public.city_slug_redirects;
CREATE POLICY city_slug_redirects_public_read
  ON public.city_slug_redirects FOR SELECT USING (true);

-- New tables need explicit grants in this project; the sibling redirect tables
-- are anon-readable because the middleware resolves a 301 before any session
-- exists.
GRANT SELECT ON public.city_slug_redirects TO anon, authenticated;
GRANT ALL    ON public.city_slug_redirects TO service_role;

-- ---------------------------------------------------------------- trigger
CREATE OR REPLACE FUNCTION public.cities_merge_redirect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn$
BEGIN
  -- merged: NULL -> not null
  IF NEW.duplicate_of_id IS NOT NULL AND OLD.duplicate_of_id IS NULL THEN
    -- Record what the flags WERE, so unmerge restores rather than guesses.
    -- Built with `||` and never jsonb_set(create_missing): that creates only
    -- the LAST path element and silently writes nothing when the parent key is
    -- absent, which is how a record that records nothing looks like a record.
    NEW.enrichment_status := coalesce(NEW.enrichment_status, '{}'::jsonb)
      || jsonb_build_object('merge_flags', jsonb_build_object(
           'prior_shell_status',  OLD.shell_status,
           'prior_seo_indexable', OLD.seo_indexable,
           'at',                  now()));
    NEW.shell_status  := 'merged';
    NEW.seo_indexable := false;

    INSERT INTO public.city_slug_redirects (old_slug, city_id)
    VALUES (NEW.slug, NEW.duplicate_of_id)
    ON CONFLICT (old_slug) DO UPDATE
      SET city_id = EXCLUDED.city_id, created_at = now();

    -- No chains. A redirect that pointed at THIS row must follow it onwards,
    -- or a later merge of the survivor leaves a 301 into another merged slug
    -- and the middleware emits one hop into a page that is itself retired.
    UPDATE public.city_slug_redirects
       SET city_id = NEW.duplicate_of_id
     WHERE city_id = NEW.id;

  -- unmerged: not null -> NULL
  ELSIF NEW.duplicate_of_id IS NULL AND OLD.duplicate_of_id IS NOT NULL THEN
    DELETE FROM public.city_slug_redirects WHERE old_slug = NEW.slug;
    -- Restore the recorded values. The fallbacks are only reached for a row
    -- merged before this trigger existed, where nothing was recorded --
    -- 'real' is what the column defaults to and is the least surprising
    -- answer, but it is a fallback and not a claim.
    NEW.shell_status := coalesce(
      OLD.enrichment_status->'merge_flags'->>'prior_shell_status', 'real');
    NEW.seo_indexable := coalesce(
      (OLD.enrichment_status->'merge_flags'->>'prior_seo_indexable')::boolean,
      NEW.seo_indexable);
    NEW.enrichment_status := coalesce(NEW.enrichment_status, '{}'::jsonb) - 'merge_flags';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.cities_merge_redirect() IS
  'Mints the slug redirect and deindexes a city as it is merged away, and '
  'reverses both on unmerge. A trigger rather than a change to merge_cities '
  'because duplicate_of_id has several writers.';

-- zz_ so it sorts after trg_cities_aa_split_name / _normalized / _slug: BEFORE
-- triggers fire in NAME order and this one must see the final slug.
DROP TRIGGER IF EXISTS trg_cities_zz_merge_redirect ON public.cities;
CREATE TRIGGER trg_cities_zz_merge_redirect
  BEFORE UPDATE ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.cities_merge_redirect();

-- ---------------------------------------------------------------- backfill
--
-- The 361 rows merged before the trigger existed. Their flags are set here
-- directly rather than by re-running the trigger, because `merge_flags` cannot
-- be reconstructed -- what the row's shell_status was at merge time is not
-- recorded anywhere -- and inventing it would make `unmerge_cities` restore a
-- value nobody measured. A row without `merge_flags` falls back to 'real',
-- which the trigger's own comment states is a fallback, not a claim.
--
-- Chains are resolved to the TERMINAL survivor: 5 of the 13 merged-target
-- rows in the corpus point at another merged row, so a redirect built from the
-- immediate parent would 301 into a retired slug.
WITH RECURSIVE chain AS (
  SELECT c.id AS start_id, c.slug AS old_slug, c.duplicate_of_id AS target, 1 AS depth
    FROM public.cities c
   WHERE c.duplicate_of_id IS NOT NULL
  UNION ALL
  SELECT ch.start_id, ch.old_slug, t.duplicate_of_id, ch.depth + 1
    FROM chain ch
    JOIN public.cities t ON t.id = ch.target
   WHERE t.duplicate_of_id IS NOT NULL AND ch.depth < 10
),
terminal AS (
  SELECT DISTINCT ON (start_id) start_id, old_slug, target
    FROM chain
   ORDER BY start_id, depth DESC
)
INSERT INTO public.city_slug_redirects (old_slug, city_id)
SELECT t.old_slug, t.target
  FROM terminal t
  JOIN public.cities k ON k.id = t.target
 WHERE t.old_slug IS NOT NULL
ON CONFLICT (old_slug) DO NOTHING;

-- Deindex what was merged away. Guarded on the row still being merged, so a
-- concurrent unmerge between authoring and apply is not silently re-buried.
UPDATE public.cities
   SET shell_status  = 'merged',
       seo_indexable = false,
       updated_at    = now()
 WHERE duplicate_of_id IS NOT NULL
   AND (shell_status IS DISTINCT FROM 'merged' OR seo_indexable);

-- ---------------------------------------------------------------- verify
DO $verify$
DECLARE
  v_indexable   int;
  v_unredirected int;
  v_redirects   int;
  v_self        int;
  v_dangling    int;
BEGIN
  SELECT count(*) INTO v_indexable
    FROM public.cities WHERE duplicate_of_id IS NOT NULL AND seo_indexable;
  IF v_indexable <> 0 THEN
    RAISE EXCEPTION '% merged cities are still seo_indexable', v_indexable;
  END IF;

  SELECT count(*) INTO v_unredirected
    FROM public.cities c
   WHERE c.duplicate_of_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.city_slug_redirects r WHERE r.old_slug = c.slug);
  IF v_unredirected <> 0 THEN
    RAISE EXCEPTION '% merged cities have no slug redirect', v_unredirected;
  END IF;

  -- Coverage before verdict: zero failures over an empty table is vacuous.
  SELECT count(*) INTO v_redirects FROM public.city_slug_redirects;
  IF v_redirects < 300 THEN
    RAISE EXCEPTION 'only % city slug redirects written -- the backfill matched almost nothing', v_redirects;
  END IF;

  -- A redirect whose target is itself merged is a 301 into a retired slug.
  SELECT count(*) INTO v_self
    FROM public.city_slug_redirects r
    JOIN public.cities k ON k.id = r.city_id
   WHERE k.duplicate_of_id IS NOT NULL;
  IF v_self <> 0 THEN
    RAISE EXCEPTION '% city redirects point at a row that is itself merged', v_self;
  END IF;

  -- And one that resolves to its own slug is a redirect loop.
  SELECT count(*) INTO v_dangling
    FROM public.city_slug_redirects r
    JOIN public.cities k ON k.id = r.city_id
   WHERE k.slug = r.old_slug;
  IF v_dangling <> 0 THEN
    RAISE EXCEPTION '% city redirects resolve to their own slug', v_dangling;
  END IF;

  RAISE NOTICE 'ok: % city slug redirects, 0 indexable merged rows, 0 chains, 0 loops', v_redirects;
END $verify$;
