-- The scraper produced malformed Wikimedia thumb URLs missing the hash path and size suffix:
--   https://upload.wikimedia.org/wikipedia/commons/thumb/Filename.jpg  (404)
-- Rewrite them to Special:FilePath which handles hashing + resizing server-side:
--   https://commons.wikimedia.org/wiki/Special:FilePath/Filename.jpg?width=600
UPDATE public.personalities
SET image_url = regexp_replace(
  image_url,
  '^https://upload\.wikimedia\.org/wikipedia/commons/thumb/([^/]+)$',
  'https://commons.wikimedia.org/wiki/Special:FilePath/\1?width=600'
)
WHERE image_url ~ '^https://upload\.wikimedia\.org/wikipedia/commons/thumb/[^/]+\.[a-zA-Z]+$';
