-- Third curated batch: LGBTQ+ STEM / science / medical-research feeds.
-- Only entries with a real RSS feed are inserted. Omitted: N/A entries and
-- "Available via Liebert Alerts" (email alerts, not RSS) — the ingest pipeline
-- is RSS-only. POZ and Positively Aware from this list are already added in the
-- prior batch (20260623130000) under the same URLs, so they are not repeated.
-- The remaining 9 are inserted below.
--
-- New sources default to is_active=true and auto_publish=false (table default),
-- so items stay review-gated until vetted. Dead feeds are handled by the
-- existing silent-zero / exponential-backoff auto-pause. Idempotent on URL.

INSERT INTO public.news_sources (name, url, source_type, category, is_active)
SELECT v.name, v.url, 'rss', v.category, true
FROM (VALUES
  ('Pride in STEM',                          'https://prideinstem.org/feed',            'science'),
  ('LGBTQ+ STEM',                            'https://lgbtstem.wordpress.com/feed',     'science'),
  ('International Journal of Transgender Health','https://tandfonline.com/feed/rss/wijt21','science'),
  ('Journal of Homosexuality',               'https://tandfonline.com/feed/rss/wjhm20', 'science'),
  ('Journal of Bisexuality',                 'https://tandfonline.com/feed/rss/wjbi20', 'science'),
  ('Nature - LGBTQ',                         'https://nature.com/subjects/lgbtq.rss',   'science'),
  ('BMJ Sexual & Reproductive Health',       'https://srh.bmj.com/rss',                 'science'),
  ('The Body',                               'https://thebody.com/rss',                 'health'),
  ('NAM aidsmap',                            'https://aidsmap.com/news/rss',            'health')
) AS v(name, url, category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.news_sources s WHERE s.url = v.url
);
