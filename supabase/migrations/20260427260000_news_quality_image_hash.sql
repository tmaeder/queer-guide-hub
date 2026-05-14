-- Image hash column on news_articles for duplicate-image detection.
-- Hash is SHA-256 of the canonicalised image URL (tracking params stripped).
-- Cheap (no byte fetch), catches the wire-service-image-reposted-everywhere case.

ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS image_hash TEXT;

-- Partial index — most legacy rows will be NULL, no point indexing them.
CREATE INDEX IF NOT EXISTS news_articles_image_hash_idx
  ON public.news_articles (image_hash)
 WHERE image_hash IS NOT NULL;

-- Pair view: articles sharing an image_hash with different titles, sorted by
-- most-shared-hash first. Powers admin "image duplicates" review.
CREATE OR REPLACE VIEW public.news_image_duplicates AS
WITH groups AS (
  SELECT image_hash, count(*) AS n,
         array_agg(id ORDER BY published_at)        AS article_ids,
         array_agg(title ORDER BY published_at)     AS titles,
         array_agg(published_at ORDER BY published_at) AS published_dates,
         array_agg(source_id ORDER BY published_at) AS source_ids
    FROM public.news_articles
   WHERE image_hash IS NOT NULL
   GROUP BY image_hash
  HAVING count(*) > 1
)
SELECT image_hash, n, article_ids, titles, published_dates, source_ids
  FROM groups
 ORDER BY n DESC, image_hash;

GRANT SELECT ON public.news_image_duplicates TO authenticated;

COMMENT ON VIEW public.news_image_duplicates IS
  'Groups of news_articles sharing the same image_hash. Same image on multiple articles is often (but not always) a duplicate — admin reviews each group.';
