-- Wave 3 — unified_tags hardening
-- 1) Slug normalization trigger (so "Gay Bar" and "gay bar" produce the same slug)
-- 2) usage_count maintenance via triggers on tagged tables
-- 3) Helper: merge_tag(canonical, duplicate) — moves usage references and points
--    duplicate.merged_into_id at canonical, sets status='merged'.
-- 4) View v_active_tags = unified_tags WHERE status='active' AND merged_into_id IS NULL.

BEGIN;

-- ----- 1. Slug normalization -----
CREATE OR REPLACE FUNCTION normalize_tag_slug(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(
           lower(coalesce(p_input, '')),
           '[^a-z0-9]+', '-', 'g'
         ));
$$;

CREATE OR REPLACE FUNCTION unified_tags_normalize_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.slug := normalize_tag_slug(coalesce(NEW.slug, NEW.name));
  IF NEW.slug = '' THEN
    NEW.slug := encode(digest(coalesce(NEW.name, NEW.id::text), 'sha1'), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unified_tags_normalize_slug ON unified_tags;
CREATE TRIGGER trg_unified_tags_normalize_slug
BEFORE INSERT OR UPDATE OF name, slug
ON unified_tags
FOR EACH ROW EXECUTE FUNCTION unified_tags_normalize_slug();

-- Backfill: re-normalize all existing slugs (duplicates → keep first by created_at).
WITH ranked AS (
  SELECT id, normalize_tag_slug(coalesce(slug, name)) AS new_slug,
         row_number() OVER (
           PARTITION BY normalize_tag_slug(coalesce(slug, name))
           ORDER BY created_at, id
         ) AS rn
    FROM unified_tags
)
UPDATE unified_tags t
   SET slug = ranked.new_slug
  FROM ranked
 WHERE t.id = ranked.id AND ranked.rn = 1;

-- For collisions, suffix slug with short id so unique index can apply
UPDATE unified_tags
   SET slug = slug || '-' || substr(id::text, 1, 6)
 WHERE id IN (
   SELECT id FROM (
     SELECT id, slug,
            row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn
       FROM unified_tags
   ) s WHERE rn > 1
 );

-- ----- 2. usage_count maintenance -----
-- Recompute usage_count from denormalized tag arrays on venues/events/news_articles.
CREATE OR REPLACE FUNCTION recount_unified_tag_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH tag_usage AS (
    SELECT slug, count(*)::int AS n FROM (
      SELECT unnest(tags) AS slug FROM venues WHERE tags IS NOT NULL
      UNION ALL
      SELECT unnest(tags) AS slug FROM events WHERE tags IS NOT NULL
      UNION ALL
      SELECT unnest(tags) AS slug FROM news_articles WHERE tags IS NOT NULL
    ) all_tags
    WHERE slug IS NOT NULL AND slug <> ''
    GROUP BY slug
  )
  UPDATE unified_tags t
     SET usage_count = coalesce(tu.n, 0),
         updated_at  = now()
    FROM tag_usage tu
   WHERE t.slug = tu.slug;

  -- Tags no longer used → 0
  UPDATE unified_tags
     SET usage_count = 0
   WHERE slug NOT IN (
     SELECT slug FROM (
       SELECT unnest(tags) AS slug FROM venues
       UNION SELECT unnest(tags) FROM events
       UNION SELECT unnest(tags) FROM news_articles
     ) used WHERE slug IS NOT NULL
   ) AND coalesce(usage_count, 0) <> 0;
END;
$$;

GRANT EXECUTE ON FUNCTION recount_unified_tag_usage() TO authenticated, service_role;

-- Initial run
SELECT recount_unified_tag_usage();

-- ----- 3. Tag merge -----
-- Atomically merges p_duplicate into p_canonical: rewrites tag references in
-- denormalized arrays and marks the duplicate as merged.
CREATE OR REPLACE FUNCTION merge_unified_tag(
  p_canonical_id uuid,
  p_duplicate_id uuid,
  p_actor text DEFAULT 'system'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canon_slug text;
  v_dup_slug   text;
BEGIN
  IF p_canonical_id = p_duplicate_id THEN
    RAISE EXCEPTION 'merge_unified_tag: canonical and duplicate are the same';
  END IF;

  SELECT slug INTO v_canon_slug FROM unified_tags WHERE id = p_canonical_id;
  SELECT slug INTO v_dup_slug   FROM unified_tags WHERE id = p_duplicate_id;
  IF v_canon_slug IS NULL OR v_dup_slug IS NULL THEN
    RAISE EXCEPTION 'merge_unified_tag: tag(s) not found';
  END IF;

  -- Rewrite denormalized arrays: replace duplicate slug with canonical slug, dedupe.
  UPDATE venues
     SET tags = (SELECT array_agg(DISTINCT t)
                   FROM unnest(tags) t
                  WHERE t IS NOT NULL),
         updated_at = now()
   WHERE v_dup_slug = ANY(tags);

  UPDATE venues
     SET tags = array_replace(tags, v_dup_slug, v_canon_slug)
   WHERE v_dup_slug = ANY(tags);

  UPDATE events
     SET tags = array_replace(tags, v_dup_slug, v_canon_slug),
         updated_at = now()
   WHERE v_dup_slug = ANY(tags);

  UPDATE news_articles
     SET tags = array_replace(tags, v_dup_slug, v_canon_slug),
         updated_at = now()
   WHERE v_dup_slug = ANY(tags);

  -- Mark duplicate
  UPDATE unified_tags
     SET status             = 'merged',
         merged_into_id     = p_canonical_id,
         deprecated_at      = now(),
         deprecation_reason = format('merged into %s by %s', v_canon_slug, p_actor),
         updated_at         = now()
   WHERE id = p_duplicate_id;

  -- Recount
  PERFORM recount_unified_tag_usage();
END;
$$;

GRANT EXECUTE ON FUNCTION merge_unified_tag(uuid, uuid, text) TO authenticated, service_role;

-- ----- 4. Active tag view -----
DROP VIEW IF EXISTS v_active_tags;
CREATE VIEW v_active_tags AS
  SELECT * FROM unified_tags
   WHERE coalesce(status, 'active') = 'active'
     AND merged_into_id IS NULL;

GRANT SELECT ON v_active_tags TO authenticated, service_role, anon;

-- ----- 5. Fuzzy duplicate finder -----
-- Returns near-dup candidates by slug similarity (pg_trgm).
CREATE OR REPLACE FUNCTION find_unified_tag_duplicates(
  p_threshold real DEFAULT 0.6,
  p_limit int DEFAULT 100
) RETURNS TABLE(
  tag_a_id uuid, tag_a_slug text,
  tag_b_id uuid, tag_b_slug text,
  similarity real
)
LANGUAGE sql
STABLE
AS $$
  SELECT a.id, a.slug, b.id, b.slug,
         similarity(a.slug, b.slug) AS sim
    FROM v_active_tags a
    JOIN v_active_tags b
      ON a.id < b.id
     AND a.slug % b.slug
   WHERE similarity(a.slug, b.slug) >= p_threshold
   ORDER BY sim DESC
   LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION find_unified_tag_duplicates(real, int)
  TO authenticated, service_role;

COMMIT;
