-- Second curated batch: international + niche LGBTQ+ press (Canada, AU, DE, ES,
-- FR, IT, NL, SE, India, HK), HIV/health titles, trans/bi outlets, and
-- mainstream/regional outlets with a queer section that expose a real RSS feed.
-- Entries marked N/A in the source list (no native RSS — the ingest pipeline is
-- RSS-only) are omitted, as are academic journals without feeds. BuzzFeed's
-- LGBTQ section is already active as "BuzzFeed LGBT", so it is skipped to avoid
-- a duplicate source. The remaining 57 are inserted below.
--
-- New sources default to is_active=true and auto_publish=false (table default),
-- so items stay review-gated until a source is vetted. Dead feeds are handled by
-- the existing silent-zero / exponential-backoff auto-pause.
-- Idempotent on URL: re-running is a no-op.

INSERT INTO public.news_sources (name, url, source_type, category, is_active)
SELECT v.name, v.url, 'rss', v.category, true
FROM (VALUES
  -- Dedicated queer press (Canada / Australia / Europe / Asia)
  ('Bay Windows',                 'https://baywindows.com/feed',                  'news'),
  ('FUSE Magazine',               'https://fusemagazine.com.au/feed',             'lifestyle'),
  ('DNA Magazine',                'https://dnamagazine.com.au/feed',              'lifestyle'),
  ('theBUZZ Magazine',            'https://thebuzzmag.ca/feed',                   'lifestyle'),
  ('PinkPlayMags',                'https://pinkplaymags.com/feed',                'lifestyle'),
  ('Wayves',                      'https://wayves.ca/rss.xml',                    'news'),
  ('Plenitude Magazine',          'https://plenitudemagazine.ca/feed',            'culture'),
  ('Gay Globe Magazine',          'https://gayglobe.us/feed',                     'news'),
  ('Archer Magazine',             'https://archermagazine.com.au/feed',           'culture'),
  ('L-Mag',                       'https://l-mag.de/feed',                        'culture'),
  ('Hinnerk',                     'https://hinnerk.de/feed',                      'news'),
  ('rik',                         'https://rik-koeln.de/feed',                    'news'),
  ('EXIT (Ruhr)',                 'https://exit-magazin.de/feed',                 'news'),
  ('GAB Magazin',                 'https://gab-magazin.de/feed',                  'lifestyle'),
  ('QX (Sweden)',                 'https://qx.se/feed',                           'news'),
  ('Gaykrant',                    'https://gaykrant.nl/feed',                     'news'),
  ('Gayly Planet',                'https://gaylyplanet.it/feed',                  'travel'),
  ('La Falla',                    'https://cassero.it/la-falla/feed',             'culture'),
  ('Komitid',                     'https://komitid.fr/feed',                      'news'),
  ('Vangardist',                  'https://vangardist.com/feed',                  'lifestyle'),
  ('Boyz',                        'https://boyz.co.uk/feed',                      'lifestyle'),
  ('The Gaily Grind',             'https://thegailygrind.com/feed',               'news'),
  ('The New Civil Rights Movement','https://thenewcivilrightsmovement.com/feed',  'news'),
  ('Gaysi Family',                'https://gaysifamily.com/feed',                 'culture'),
  ('Bombay Dost',                 'https://bombaydost.co.in/feed',                'news'),
  ('Scene Magazine',              'https://scenemag.co.uk/feed',                  'lifestyle'),
  ('GScene',                      'https://gscene.com/feed',                      'news'),
  ('OutVoices',                   'https://outvoices.us/feed',                    'news'),
  -- HIV / health
  ('A&U Magazine',                'https://aumag.org/feed',                       'health'),
  ('Plus Magazine',               'https://hivplusmag.com/feed',                  'health'),
  ('Positively Aware',            'https://positivelyaware.com/rss.xml',          'health'),
  ('POZ',                         'https://poz.com/rss',                          'health'),
  -- Trans / bi
  ('Transgender Universe',        'https://transgenderuniverse.com/feed',         'transgender'),
  ('TransAdvocate',               'https://transadvocate.com/feed',               'transgender'),
  ('Bi.org',                      'https://bi.org/en/rss',                        'community'),
  -- Mainstream / regional sections with a real feed
  ('NPR - LGBTQ',                 'https://feeds.npr.org/1162/rss.xml',           'news'),
  ('Vox - LGBTQ',                 'https://vox.com/lgbtq/rss/index.xml',          'news'),
  ('The Telegraph - LGBT',        'https://telegraph.co.uk/lgbt/rss.xml',         'news'),
  ('Sydney Morning Herald - LGBTQ','https://smh.com.au/rss/topic/lgbtq-60j.xml',  'news'),
  ('CBC News - LGBTQ',            'https://cbc.ca/cmlink/rss-news-lgbtq',         'news'),
  ('GQ - LGBTQ',                  'https://gq.com/feed/lgbt/rss',                 'lifestyle'),
  ('Vogue - LGBTQ',               'https://vogue.com/feed/tag/misc/lgbtq/rss',    'lifestyle'),
  ('Teen Vogue - Identity',       'https://teenvogue.com/feed/identity/rss',      'culture'),
  ('Slate - Outward',             'https://slate.com/feeds/outward.rss',          'culture'),
  ('Salon - LGBTQ',               'https://salon.com/category/lgbtq/feed',        'news'),
  ('ProPublica - LGBTQ',          'https://propublica.org/feeds/propublica/topics/lgbtq', 'news'),
  ('South China Morning Post - LGBTQ','https://scmp.com/rss/318182/feed',         'news'),
  ('El Diario - LGTBI',           'https://eldiario.es/rss/temas/lgtbi',          'news'),
  ('Público - LGTBI',             'https://publico.es/rss/tag/lgtbi',             'news'),
  ('Le Monde - LGBT',             'https://lemonde.fr/lgbt/rss_full.xml',         'news'),
  ('Libération - LGBT',           'https://liberation.fr/rss/dossier/lgbt',       'news'),
  ('Der Spiegel - LGBTQ',         'https://spiegel.de/thema/lgbtq/index.rss',     'news'),
  ('Die Zeit - LGBTQ',            'https://zeit.de/thema/lgbtq/index.xml',        'news'),
  ('The Village Voice - Queer',   'https://villagevoice.com/category/queer/feed', 'culture'),
  ('NOW Toronto - LGBTQ',         'https://nowtoronto.com/category/culture/lgbtq/feed', 'culture'),
  ('Austin Chronicle - Gay Place','https://austinchronicle.com/gay-place/feed',   'news'),
  ('The Georgia Straight - LGBTQ','https://straight.com/rss',                     'news')
) AS v(name, url, category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.news_sources s WHERE s.url = v.url
);
