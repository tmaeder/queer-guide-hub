-- Second batch of vetted LGBTQ+ RSS feeds: more languages (FR/IT/ES — the
-- translate pipeline covers these), a dedicated trans-news source, and Canada.
-- Every URL verified to return valid RSS with items. Idempotent on URL.

INSERT INTO public.news_sources (name, url, source_type, category, is_active)
SELECT v.name, v.url, 'rss', v.category, true
FROM (VALUES
  ('Assigned Media', 'https://www.assignedmedia.org/feed',  'transgender'),
  ('Tetu',           'https://tetu.com/feed/',              'news'),
  ('Gay.it',         'https://www.gay.it/feed',             'news'),
  ('dosmanzanas',    'https://www.dosmanzanas.com/feed',    'news'),
  ('Dallas Voice',   'https://dallasvoice.com/feed/',       'news'),
  ('Gay Times',      'https://www.gaytimes.com/feed/',      'lifestyle'),
  ('Xtra Magazine',  'https://xtramagazine.com/feed/',      'news')
) AS v(name, url, category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.news_sources s WHERE s.url = v.url
);
