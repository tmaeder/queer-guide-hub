-- Data cleanup: strip on-origin Cloudflare image-resizing segments from
-- marketplace_listings.images. The original scraper captured misterb's
-- `/cdn-cgi/image/format=auto,onerror=redirect/...` og:image URLs, which fail to
-- load cross-origin (the card fell back to a placeholder for ~831 listings). The
-- underlying direct `/media/...` path loads fine. The extractor now normalises
-- these on ingest (_shared/marketplace-extract.ts); this fixes existing rows.
UPDATE marketplace_listings m
SET images = (
  SELECT array_agg(regexp_replace(u, '/cdn-cgi/image/[^/]+/', '/'))
  FROM unnest(m.images) u
)
WHERE EXISTS (SELECT 1 FROM unnest(m.images) u WHERE u LIKE '%/cdn-cgi/image/%');
