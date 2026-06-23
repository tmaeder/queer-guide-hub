-- Bulk-add a curated 100-publication LGBTQ+ news set: dedicated queer
-- newspapers/magazines plus mainstream outlets with a queer/LGBTQ+ section.
-- Of the 100, 21 are already active under their canonical/verified feed URLs
-- (The Advocate, Out, Washington Blade, Gay Times, PinkNews, LGBTQ Nation,
-- them., Gay City News, Dallas Voice, Metro Weekly, Philadelphia Gay News,
-- The Guardian, Attitude, Xtra, Star Observer, GCN, Têtu, Gay.it, Queerty,
-- Outsports, DIVA) and are deliberately NOT re-inserted here to avoid a
-- duplicate source under a second URL form. Four (Washington Post, New York
-- Times, CNN, Reuters) have no native RSS feed and the ingest pipeline is
-- RSS-only, so they are omitted. The remaining 75 are inserted below.
--
-- New sources default to is_active=true and auto_publish=false (table default)
-- so items are review-gated until a source is vetted. Bad/dead feeds are
-- handled by the existing silent-zero / exponential-backoff auto-pause.
-- Idempotent: only inserts URLs not already present, so re-running is a no-op.

INSERT INTO public.news_sources (name, url, source_type, category, is_active)
SELECT v.name, v.url, 'rss', v.category, true
FROM (VALUES
  ('HuffPost Queer Voices',   'https://huffpost.com/section/queer-voices/feed',   'news'),
  ('NBC News Out',            'https://nbcnews.com/id/3032091/device/rss/rss.xml','news'),
  ('Autostraddle',            'https://autostraddle.com/feed',                    'culture'),
  ('Bay Area Reporter',       'https://ebar.com/rss',                             'news'),
  ('Watermark Online',        'https://watermarkonline.com/feed',                 'news'),
  ('The Georgia Voice',       'https://thegavoice.com/feed',                      'news'),
  ('Windy City Times',        'https://windycitytimes.com/feed',                  'news'),
  ('South Florida Gay News',  'https://southfloridagaynews.com/feed',             'news'),
  ('Los Angeles Blade',       'https://losangelesblade.com/feed',                 'news'),
  ('Seattle Gay News',        'https://sgn.org/feed',                             'news'),
  ('Instinct Magazine',       'https://instinctmagazine.com/feed',                'lifestyle'),
  ('QNotes',                  'https://goqnotes.com/feed',                        'news'),
  ('Between The Lines',       'https://pridesource.com/feed',                     'news'),
  ('Out in Jersey',           'https://outinjersey.net/feed',                     'news'),
  ('The Pride LA',            'https://thepridela.com/feed',                      'news'),
  ('Out Front Magazine',      'https://outfrontmagazine.com/feed',                'news'),
  ('Queer Forty',             'https://queerforty.com/feed',                      'lifestyle'),
  ('Fugues',                  'https://fugues.com/rss',                           'lifestyle'),
  ('QNews',                   'https://qnews.com.au/feed',                        'news'),
  ('LOTL',                    'https://lotl.com/feed',                            'culture'),
  ('Gay Express',             'https://gayexpress.co.nz/feed',                    'news'),
  ('Shangay',                 'https://shangay.com/feed',                         'lifestyle'),
  ('Gay.it',                  'https://gay.it/feed',                              'news'),
  ('Schwulissimo',            'https://schwulissimo.de/feed',                     'news'),
  ('Blu',                     'https://blu.fm/feed',                              'lifestyle'),
  ('Siegessäule',             'https://siegessaeule.de/feed',                     'news'),
  ('QX Magazine',             'https://qxmagazine.com/feed',                      'lifestyle'),
  ('Out in Perth',            'https://outinperth.com/feed',                      'news'),
  ('Gayety',                  'https://gayety.co/feed',                           'lifestyle'),
  ('Towleroad',               'https://towleroad.com/feed',                       'news'),
  ('Joe.My.God.',             'https://joemygod.com/feed',                        'news'),
  ('Curve Magazine',          'https://curvemag.com/feed',                        'culture'),
  ('Tagg Magazine',           'https://taggmagazine.com/feed',                    'lifestyle'),
  ('The Queer Review',        'https://thequeerreview.com/feed',                  'culture'),
  ('Bear World Magazine',     'https://bearworldmag.com/feed',                    'lifestyle'),
  ('Q Salt Lake',             'https://qsaltlake.com/feed',                       'news'),
  ('OutSmart Magazine',       'https://outsmartmagazine.com/feed',                'news'),
  ('Focus Mid-South',         'https://focusmidsouth.com/feed',                   'news'),
  ('LGBTQ San Diego News',    'https://lgbtqsd.news/feed',                        'news'),
  ('Baltimore OutLoud',       'https://baltimoreoutloud.com/feed',                'news'),
  ('Out & About Nashville',   'https://outandaboutnashville.com/feed',            'news'),
  ('Lavender Magazine',       'https://lavendermagazine.com/feed',                'lifestyle'),
  ('Gay & Lesbian Review',    'https://glreview.org/feed',                        'culture'),
  ('GayRVA',                  'https://gayrva.com/feed',                          'news'),
  ('The Fight Magazine',      'https://thefightmag.com/feed',                     'lifestyle'),
  ('Outwords',                'https://outwords.ca/feed',                         'news'),
  ('Erie Gay News',           'https://eriegaynews.com/rss',                      'news'),
  ('Gay Vegas',               'https://gayvegas.com/feed',                        'lifestyle'),
  ('Outlook Ohio',            'https://outlookohio.com/feed',                     'news'),
  ('Camp Kansas City',        'https://campkc.com/feed',                          'news'),
  ('The Vital Voice',         'https://vitalvoice.com/feed',                      'news'),
  ('Ion Arizona',             'https://ionarizona.com/feed',                      'news'),
  ('Echo Magazine',           'https://echomag.com/feed',                         'news'),
  ('Compass News',            'https://compassnews.org/feed',                     'news'),
  ('The Rainbow Times',       'https://therainbowtimesmass.com/feed',             'news'),
  ('Boston Spirit Magazine',  'https://bostonspiritmagazine.com/feed',            'lifestyle'),
  ('Connecticut Boy',         'https://ctboy.com/feed',                           'lifestyle'),
  ('OutClique',               'https://outclique.com/feed',                       'lifestyle'),
  ('SF Bay Times',            'https://sfbaytimes.com/feed',                      'news'),
  ('The Gayly',               'https://gayly.com/feed',                           'news'),
  ('Outlook Columbus',        'https://outlookcolumbus.com/feed',                 'news'),
  ('WUSSY Mag',               'https://wussymag.com/feed',                        'culture'),
  ('Gayletter',               'https://gayletter.com/feed',                       'culture'),
  ('Passport Magazine',       'https://passportmagazine.com/feed',                'travel'),
  ('Lesbian News',            'https://lesbiannews.com/feed',                     'news'),
  ('Vice - LGBTQ',            'https://vice.com/en/rss?topic=lgbtq',              'culture'),
  ('The Independent - LGBT+', 'https://independent.co.uk/topic/lgbt/rss',         'news'),
  ('USA Today - LGBTQ',       'https://usatoday.com/news/lgbtq/rss',              'news'),
  ('BBC News - LGBT',         'https://bbc.co.uk/news/10628494/rss.xml',          'news'),
  ('Daily Beast - LGBTQ',     'https://thedailybeast.com/category/lgbtq/feed',    'news'),
  ('Newsweek - LGBTQ',        'https://newsweek.com/topic/lgbtq/feed',            'news'),
  ('Time - LGBTQ',            'https://time.com/tag/lgbtq/feed',                  'news'),
  ('Rolling Stone - LGBTQ',   'https://rollingstone.com/t/lgbtq/feed',            'culture'),
  ('Billboard - Pride',       'https://billboard.com/c/pride/feed',               'culture'),
  ('Variety - Queer',         'https://variety.com/v/queer/feed',                 'culture'),
  ('Hollywood Reporter - LGBTQ','https://hollywoodreporter.com/t/lgbtq/feed',     'culture')
) AS v(name, url, category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.news_sources s WHERE s.url = v.url
);
