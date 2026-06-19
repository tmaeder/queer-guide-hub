-- News tag controlled-vocabulary cleanup.
--
-- news_articles.tags[] was an uncontrolled free-text vocabulary: ~9,000 distinct
-- lowercased values across 13.4k tagged articles, dominated by (a) fragmentation of
-- common concepts ("gay-marriage" / "same-sex-marriage" / "marriage-equality";
-- "trans-rights" / "transgender-rights"; the whole "lgbtqia-<topic>" /
-- "lgbtq-<topic>" / "queer-<topic>" / "gay-<topic>" prefix family) and (b) LLM
-- enrichment boilerplate ("access-to-inclusive-public-spaces" used 2,511×,
-- "acceptance" 2,335×). These raw values render directly as chips (NewsCard
-- fallback eyebrow + NewsDetail Tags card + NewsFilters facet) and link to
-- /resources/{tag}, so the noise is user-facing.
--
-- A trg_normalize_news_tags BEFORE trigger already calls normalize_news_tags() on
-- every write, but the prior function only collapsed a handful of umbrella tokens.
-- This migration REPLACES that function with a comprehensive, still-IMMUTABLE
-- normalizer (slugify -> strip redundant queer-umbrella prefix -> curated alias map
-- -> drop boilerplate denylist -> dedupe/sort). Because the function stays the
-- single write-gate, the vocabulary cannot re-fragment on future ingest.
--
-- The one-time backfill of existing rows is reversible (run_news_tag_cleanup snapshots
-- prior tags into news_tag_cleanup_backup_20260619) and is drained in batches by
-- scripts/data-quality/clean-news-tags.mjs. NOTE: news search_documents do NOT index
-- tags (search_documents_index_news builds its tsvector/facets from title/category/
-- excerpt only), so the AFTER trigger trg_search_documents_news can be safely disabled
-- during the backfill to avoid churning the disk-constrained search_documents/HNSW.
--
-- Deliberately NOT a venue-style "default-reject to a 37-term whitelist": news tags
-- are mostly legitimate long-tail topics (cities, people, shows, countries). Singletons
-- are preserved by design; only clear synonyms collapse and only contentless enrichment
-- boilerplate is dropped.

-- 1) Reversible snapshot target -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.news_tag_cleanup_backup_20260619 (
  id            uuid PRIMARY KEY,
  tags          text[] NOT NULL,
  backed_up_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.news_tag_cleanup_backup_20260619 IS
  'Pre-normalization snapshot of news_articles.tags for the 2026-06-19 vocabulary cleanup. Rollback: UPDATE news_articles n SET tags = b.tags FROM news_tag_cleanup_backup_20260619 b WHERE n.id = b.id;';

-- 2) Comprehensive normalizer (replaces the skeletal prior version) -------------
CREATE OR REPLACE FUNCTION public.normalize_news_tags(p_tags text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $fn$
  WITH exploded AS (
    -- slugify: lowercase, non-[a-z0-9+] -> '-', trim leading/trailing '-'
    SELECT trim(both '-' from regexp_replace(lower(trim(t)), '[^a-z0-9+]+', '-', 'g')) AS slug
    FROM unnest(coalesce(p_tags, '{}'::text[])) AS t
    WHERE t IS NOT NULL AND trim(t) <> ''
  ),
  stripped AS (
    -- strip a leading queer-umbrella qualifier from compound topics
    -- (lgbtqia-film/queer-film/gay-film -> film). NEVER strips "trans-".
    SELECT CASE
             WHEN slug ~ '^(lgbtqia\+|lgbtqia|lgbtq\+|lgbtq|lgbti|lgbtqi|lgbt|queer|gay)-[a-z0-9].*'
             THEN regexp_replace(slug, '^(lgbtqia\+|lgbtqia|lgbtq\+|lgbtq|lgbti|lgbtqi|lgbt|queer|gay)-', '')
             ELSE slug
           END AS slug
    FROM exploded
  ),
  mapped AS (
    SELECT COALESCE(m.canon, s.slug) AS tag
    FROM stripped s
    LEFT JOIN (VALUES
      -- umbrella identity tokens
      ('lgbtqia','lgbtqia+'),('lgbtq','lgbtqia+'),('lgbtq+','lgbtqia+'),('lgbt','lgbtqia+'),('lgbti','lgbtqia+'),('lgbtqi','lgbtqia+'),
      -- re-qualify bare results of the prefix strip that are too generic as standalone chips
      ('rights','lgbtqia-rights'),('spaces','queer-spaces'),('venues','queer-spaces'),
      ('issues','lgbtqia+'),('topics','lgbtqia+'),('people','lgbtqia+'),('person','lgbtqia+'),
      ('phobia','homophobia'),('men','gay-men'),
      -- trans family (trans- is never prefix-stripped, so normalize explicitly)
      ('trans','transgender'),('transgender-rights','trans-rights'),
      ('transgender-athlete','transgender-athletes'),('trans-athletes','transgender-athletes'),('trans-athlete','transgender-athletes'),
      ('transgender-issues','trans-issues'),('trans-youth','transgender-youth'),('trans-kids','transgender-youth'),
      ('trans-woman','trans-women'),('transition','gender-transition'),
      -- anti-LGBTQ legislation family
      ('anti-lgbtq-laws','anti-lgbtqia-laws'),('anti-lgbt-laws','anti-lgbtqia-laws'),('anti-lgbtqia+-laws','anti-lgbtqia-laws'),
      ('anti-lgbtq+-laws','anti-lgbtqia-laws'),('anti-lgbtqia-policies','anti-lgbtqia-laws'),('anti-lgbtqia','anti-lgbtqia-laws'),
      ('anti-lgbtq+','anti-lgbtqia-laws'),('anti-lgbtq','anti-lgbtqia-laws'),
      ('anti-trans','anti-trans-legislation'),('anti-trans-laws','anti-trans-legislation'),
      -- marriage
      ('marriage','same-sex-marriage'),('marriage-equality','same-sex-marriage'),('same-sex-relations','same-sex-relationships'),
      -- media / culture synonyms
      ('cinema','film'),('films','film'),('movies','film'),('tv-shows','tv'),('tv-series','tv'),('television','tv'),
      ('literature','books'),('arts','art'),('nonbinary','non-binary'),('bisexuality','bisexual'),('inclusivity','inclusion'),
      -- health / hate
      ('aids','hiv-aids'),('acquired-immunodeficiency-syndrome-aids','hiv-aids'),('hate-crime','hate-crimes'),
      ('homophobic-slur','homophobia'),('anti-semitism','antisemitism'),
      ('accessibility-in-lgbtqia-spaces','accessibility'),('accessible-healthcare','healthcare'),('healthcare-access','healthcare'),
      -- misc
      ('drag-queens','drag-queen'),('drag-race','rupauls-drag-race'),
      ('celebs','celebrity'),('celebrity-news','celebrity'),('celebrities','celebrity'),
      ('pride-flags','pride-flag'),('rainbow-flag','pride-flag'),('pride-event','pride-events')
    ) AS m(raw, canon) ON m.raw = s.slug
  )
  SELECT COALESCE(array_agg(DISTINCT tag ORDER BY tag), '{}'::text[])
  FROM mapped
  WHERE tag NOT IN (
    -- contentless LLM-enrichment boilerplate
    'access-to-public-services','access-to-inclusive-public-spaces','accepting','acceptance',
    -- structural junk
    'null','undefined','general','rss-news','rss_news','news','uncategorized','none','n-a','-',''
  );
$fn$;

COMMENT ON FUNCTION public.normalize_news_tags(text[]) IS
  'Controlled-vocabulary normalizer for news_articles.tags. Wired into trg_normalize_news_tags (BEFORE INSERT/UPDATE OF tags) as the perpetual write-gate. slugify -> strip queer-umbrella prefix -> alias map -> drop boilerplate -> dedupe/sort.';

-- 3) Batched, reversible backfill driver RPC ------------------------------------
CREATE OR REPLACE FUNCTION public.run_news_tag_cleanup(p_batch int DEFAULT 300)
RETURNS TABLE(processed int, terms_dropped bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id
    FROM public.news_articles
    WHERE tags IS NOT NULL AND cardinality(tags) > 0
      AND public.normalize_news_tags(tags) IS DISTINCT FROM tags
    ORDER BY id
    LIMIT GREATEST(p_batch, 1)
  ) s;

  IF v_ids IS NULL THEN
    processed := 0; terms_dropped := 0; RETURN NEXT; RETURN;
  END IF;

  -- snapshot prior tags (reversible); first-write-wins so resumes don't clobber
  INSERT INTO public.news_tag_cleanup_backup_20260619 (id, tags)
  SELECT id, tags FROM public.news_articles WHERE id = ANY(v_ids)
  ON CONFLICT (id) DO NOTHING;

  SELECT processed_cnt, dropped FROM (
    SELECT count(*) AS processed_cnt,
           coalesce(sum(cardinality(tags) - cardinality(public.normalize_news_tags(tags))), 0) AS dropped
    FROM public.news_articles WHERE id = ANY(v_ids)
  ) q INTO processed, terms_dropped;

  -- BEFORE trigger trg_normalize_news_tags re-applies normalize_news_tags; explicit for clarity.
  UPDATE public.news_articles n
  SET tags = public.normalize_news_tags(n.tags)
  WHERE n.id = ANY(v_ids);

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.run_news_tag_cleanup(int) FROM public, anon, authenticated;
COMMENT ON FUNCTION public.run_news_tag_cleanup(int) IS
  'One-time/maintenance driver: normalizes up to p_batch news_articles whose tags are not at the normalize_news_tags fixed point, snapshotting prior tags to news_tag_cleanup_backup_20260619. Idempotent; drained by scripts/data-quality/clean-news-tags.mjs.';

-- 4) Seed curated tag_aliases (non-destructive) so reconcile captures variants ---
INSERT INTO public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
SELECT u.id, v.alias, v.alias, 'synonym', 'approved'
FROM (VALUES
  -- variant slug, canonical unified_tags.slug
  ('lgbtq-rights','lgbtqia-rights'),('lgbtq+-rights','lgbtqia-rights'),('lgbt-rights','lgbtqia-rights'),
  ('gay-rights','lgbtqia-rights'),('lgbtqia+-rights','lgbtqia-rights'),('queer-rights','lgbtqia-rights'),
  ('gay-marriage','same-sex-marriage'),('marriage-equality','same-sex-marriage'),
  ('trans','transgender'),
  ('trans-athletes','transgender-athletes'),('trans-athlete','transgender-athletes'),('transgender-athlete','transgender-athletes'),
  ('hate-crime','hate-crimes'),
  ('nonbinary','non-binary'),
  ('homophobic-slur','homophobia'),('lgbtqia-phobia','homophobia'),
  ('drag-queens','drag-queen')
) AS v(alias, canonical_slug)
JOIN public.unified_tags u
  ON u.slug = v.canonical_slug AND (u.status = 'active' OR u.status IS NULL)
WHERE NOT EXISTS (SELECT 1 FROM public.tag_aliases a WHERE a.alias_slug = v.alias);
