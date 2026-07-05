-- Add 13 vetted LGBTQ+ news RSS feeds. The existing active set skewed US/UK;
-- this broadens geography (AU, ZA, Ireland, Argentina) and adds a dedicated
-- global criminalization/safety source (Erasing 76 Crimes). Every URL was
-- verified to return valid RSS with items before inclusion. Idempotent: only
-- inserts URLs not already present, so re-running is a no-op. Bad feeds that
-- later die are handled by the existing silent-zero / backoff auto-pause.

INSERT INTO public.news_sources (name, url, source_type, category, is_active)
SELECT v.name, v.url, 'rss', v.category, true
FROM (VALUES
  ('The Advocate',          'https://www.advocate.com/feeds/feed.rss',   'news'),
  ('them.',                 'https://www.them.us/feed/rss',              'culture'),
  ('GLAAD',                 'https://glaad.org/feed/',                   'advocacy'),
  ('Erasing 76 Crimes',     'https://76crimes.com/feed/',                'rights'),
  ('Gay City News',         'https://gaycitynews.com/feed/',             'news'),
  ('Metro Weekly',          'https://www.metroweekly.com/feed/',         'news'),
  ('Philadelphia Gay News', 'https://epgn.com/feed/',                    'news'),
  ('Star Observer',         'https://www.starobserver.com.au/feed/',     'news'),
  ('MambaOnline',           'https://www.mambaonline.com/feed/',         'news'),
  ('GCN',                   'https://gcn.ie/feed/',                       'news'),
  ('DIVA Magazine',         'https://diva-magazine.com/feed/',           'culture'),
  ('Attitude',              'https://www.attitude.co.uk/feed/',          'lifestyle'),
  ('Agencia Presentes',     'https://agenciapresentes.org/feed/',        'news')
) AS v(name, url, category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.news_sources s WHERE s.url = v.url
);
