-- Seed 93 LGBTQ+ podcast feeds as news_sources (feed_type='podcast').
-- Episodes flow through the existing news pipeline as news_articles rows
-- (media_type='podcast'), mixed into /news with the Podcasts filter + inline
-- player added in PR #1772 (migration 20260623063103_news_podcasts.sql).
--
-- The task supplied Apple Podcasts / Spotify *page* URLs, which the RSS
-- ingester (source-rss-news) cannot parse. Each show was resolved to its
-- canonical RSS enclosure feed via the iTunes lookup/search API and verified
-- to return podcast <item>s before inclusion. Shows whose supplied Apple IDs
-- were invalid and could not be matched to a real feed were left out rather
-- than ingest a wrong show into the feed.
--
-- Idempotent: only inserts feed URLs not already present, so re-running is a
-- no-op. Dead/changed feeds are handled by the existing silent-zero / backoff
-- auto-pause logic in source-rss-news.

INSERT INTO public.news_sources (name, url, source_type, category, feed_type, is_active)
SELECT v.name, v.url, 'rss', 'podcast', 'podcast', true
FROM (VALUES
  ('Making Gay History', 'https://feeds.megaphone.fm/makinggayhistory'),
  ('LGBTQ&A', 'https://anchor.fm/s/a36b70a8/podcast/rss'),
  ('Gender Reveal', 'https://rss.libsyn.com/shows/112558/destinations/629489.xml'),
  ('Food 4 Thot', 'https://feeds.acast.com/public/shows/6308f1555c22540012623890'),
  ('Getting Curious with Jonathan Van Ness', 'https://rss.pdrl.fm/4007f2/feeds.megaphone.fm/prettycurious'),
  ('Dyking Out', 'https://feeds.megaphone.fm/LAV5639079117'),
  ('Queery with Cameron Esposito', 'https://feeds.simplecast.com/fOCFcskz'),
  ('The Bald and the Beautiful', 'https://baldandbeautiful.podomatic.com/rss2.xml'),
  ('Sibling Rivalry', 'https://feeds.megaphone.fm/siblingrivalry'),
  ('Bad Gays', 'https://feed.podbean.com/badgayspod/feed.xml'),
  ('History is Gay', 'https://rss.libsyn.com/shows/111281/destinations/616417.xml'),
  ('The Log Books', 'https://feeds.acast.com/public/shows/8944199b-0784-496d-af62-40af3d970221'),
  ('Keep It!', 'https://audioboom.com/channels/5166621.rss'),
  ('Las Culturistas', 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/f6816727-c503-47ac-a7ac-ae2700391b1e/935c500f-8bb0-436b-ba7f-ae2700391b49/podcast.rss'),
  ('The Read', 'https://feeds.simplecast.com/hEYNk1fd'),
  ('Vibe Check', 'https://feeds.simplecast.com/tA_4bn2c'),
  ('Outward', 'https://feeds.acast.com/public/shows/695ea6f6a32e86d77583c599'),
  ('A Gay and An NonGay', 'https://rss.pdrl.fm/78ae6a/feeds.megaphone.fm/agayandanongay'),
  ('We''re Having Gay Sex', 'https://feeds.megaphone.fm/werehavinggaysex'),
  ('Handsome', 'https://rss.art19.com/handsome'),
  ('StraightioLab', 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/0c221bad-4dc8-419f-b554-aee6011ef1a7/f6ada493-0cfd-44b6-ac5c-aee6011ef1ee/podcast.rss'),
  ('Sounds Fake But Okay', 'https://rss.buzzsprout.com/218346.rss'),
  ('Bisexual Brunch', 'https://rss.buzzsprout.com/903484.rss'),
  ('AfroQueer', 'https://feed.podbean.com/afroqueerpodcast/feed.xml'),
  ('TransLash Podcast', 'https://feeds.acast.com/public/shows/6c44f4c8-fa7e-43de-982c-1c1eadc88a30'),
  ('Marsha''s Plate', 'https://feeds.soundcloud.com/users/soundcloud:users:10632874/sounds.rss'),
  ('The Magnus Archives', 'https://feeds.acast.com/public/shows/b6085bcd-3542-4a43-b6a8-021e3fd251b8'),
  ('Welcome to Night Vale', 'https://feeds.megaphone.fm/SBP4591212513'),
  ('The Penumbra Podcast', 'https://feeds.acast.com/public/shows/6831c608381499796b234652'),
  ('Alice Isn''t Dead', 'https://feeds.megaphone.fm/SBP8990444845'),
  ('Queer as Fact', 'https://feed.podbean.com/queerasfact/feed.xml'),
  ('One From the Vaults', 'https://feeds.soundcloud.com/users/soundcloud:users:195654199/sounds.rss'),
  ('Attitudes!', 'https://feeds.megaphone.fm/LEME5992234394'),
  ('FANTI', 'https://feeds.simplecast.com/4jxztCzv'),
  ('Gayest Episode Ever', 'https://rss.pdrl.fm/c31c77/feeds.libsyn.com/250631/rss/?redirect=false'),
  ('Two Dykes and a Mic', 'https://anchor.fm/s/aee8cfac/podcast/rss'),
  ('Chosen Family', 'https://feeds.megaphone.fm/chosenfamilypodcast'),
  ('Homo Sapiens', 'https://feeds.acast.com/public/shows/806a1fbf-805e-4883-937e-91feced7dd16'),
  ('Call Me Mother', 'https://anchor.fm/s/507ae694/podcast/rss'),
  ('Nancy', 'https://feeds.simplecast.com/6bO7pkNF'),
  ('Seeking Derangements', 'https://feeds.soundcloud.com/users/soundcloud:users:795266155/sounds.rss'),
  ('I''m Grand Mam', 'https://feeds.acast.com/public/shows/12acded9-ef08-571a-bee2-a78f22246898'),
  ('Gayish', 'https://feed.podbean.com/gayishpodcast/feed.xml'),
  ('Bitter Brown Femmes', 'https://audioboom.com/channels/4939795.rss'),
  ('Queersplaining', 'https://rss.libsyn.com/shows/109610/destinations/599092.xml'),
  ('Queerology', 'https://feed.podbean.com/queerologypodcast/feed.xml'),
  ('Disability After Dark', 'https://pinecast.com/feed/disability-after-dark'),
  ('Gender Spiral', 'https://rss.libsyn.com/shows/472722/destinations/4006617.xml'),
  ('Hello From The Hallowoods', 'https://rss.buzzsprout.com/2022026.rss'),
  ('The Bright Sessions', 'https://rss.art19.com/the-bright-sessions'),
  ('Caravan', 'https://feeds.megaphone.fm/caravan'),
  ('Unwell', 'https://anchor.fm/s/4c02b4e8/podcast/rss'),
  ('Gay Future', 'https://feeds.captivate.fm/gay-future/'),
  ('Starship Q Star', 'https://feeds.acast.com/public/shows/6366fb57509b73001260bb81'),
  ('Queer Serial', 'https://queerserial.com/podcast?format=rss'),
  ('Memories from the Dance Floor', 'https://feeds.acast.com/public/shows/639c5c46c69dde00113cd2b7'),
  ('Sounds Gay', 'https://feeds.simplecast.com/Ovd_yGY6'),
  ('A Field Guide to Gay Animals', 'https://feeds.acast.com/public/shows/631a1654e45ca00012f67fb8'),
  ('The Anti-Trans Hate Machine', 'https://feeds.acast.com/public/shows/c7cfdaa3-ab48-4e0b-a40f-e94262ce110d'),
  ('Blind Landing', 'https://feeds.megaphone.fm/blindlanding'),
  ('Scam Goddess', 'https://feeds.simplecast.com/4YELvXgu'),
  ('Bad Dates', 'https://anchor.fm/s/46b49664/podcast/rss'),
  ('A Bit Fruity', 'https://feeds.megaphone.fm/AAA7921763663'),
  ('Shut Up Evan', 'https://feeds.acast.com/public/shows/9493a099-e257-56f0-96a2-50d7c60874aa'),
  ('Cruisin''', 'https://anchor.fm/s/2178d89c/podcast/rss'),
  ('Hoodrat to Headwrap', 'https://feeds.soundcloud.com/users/soundcloud:users:326016614/sounds.rss'),
  ('Outspoken Voices', 'https://rss.buzzsprout.com/171190.rss'),
  ('NB: My Non-Binary Life', 'https://podcasts.files.bbci.co.uk/p06y51dp.rss'),
  ('Queer Sex Ed', 'https://rss.libsyn.com/shows/107450/destinations/582306.xml'),
  ('Coming Out Pod', 'https://www.spreaker.com/show/5207650/episodes/feed'),
  ('How it Ends', 'https://feeds.megaphone.fm/SBP1062532266'),
  ('The Sheridan Tapes', 'https://feeds.megaphone.fm/SBP3023603464'),
  ('Dreamboy', 'https://feeds.megaphone.fm/SBP3348662609'),
  ('Girl in Space', 'https://feeds.megaphone.fm/girlinspace'),
  ('The Lesbian Romantic', 'https://feeds.transistor.fm/the-lesbian-romantic'),
  ('Pasithea Powder', 'https://feeds.soundcloud.com/users/soundcloud:users:720575566/sounds.rss'),
  ('Alba Salix', 'https://rss.art19.com/alba-salix--royal-physician'),
  ('Like a Virgin', 'https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/3bd18291-eae2-436c-9498-ae39005b2529/02971f95-9cc8-4ee5-bc87-ae39005b2532/podcast.rss'),
  ('Gay Men Going Deeper', 'https://feeds.castos.com/057q8'),
  ('The Gayly Dose', 'https://anchor.fm/s/3a965124/podcast/rss'),
  ('The Queer Quadrant', 'https://rss.amperwave.net/v2/feed/podcorn/8e735a71c507487b41840143792544ce'),
  ('Pride', 'https://feeds.megaphone.fm/SHML7554232525'),
  ('Homo Schedule', 'https://feeds.megaphone.fm/NETFLIX7179346045'),
  ('OutBuro', 'https://anchor.fm/s/21e8107c/podcast/rss'),
  ('Our Queer History', 'https://anchor.fm/s/10d160644/podcast/rss'),
  ('Lez Hang Out', 'https://feeds.megaphone.fm/LAV7402407500'),
  ('Queer Collective', 'https://feeds.simplecast.com/GipEP0Cp'),
  ('Slayerfest 98', 'https://feed.podbean.com/slayerfest98/feed.xml'),
  ('The Lavender Hour', 'https://api.riverside.fm/hosting/4E8MMuLl.rss'),
  ('Authentic Sex', 'https://rss.libsyn.com/shows/99603/destinations/521850.xml'),
  ('Queerly Beloved', 'https://feeds.acast.com/public/shows/970e071b-0117-43bb-a95c-5186dd5c1456'),
  ('Queerly Recommended', 'https://rss.libsyn.com/shows/315251/destinations/2539805.xml'),
  ('The BiCast', 'https://feeds.feedburner.com/thebicast/bBsK')
) AS v(name, url)
WHERE NOT EXISTS (
  -- Skip if the feed URL is already registered, OR a source with the same
  -- name already exists (case-insensitive). The live catalog already holds a
  -- broad podcast set, so a same-name show under a different feed URL would
  -- otherwise create a confusing duplicate row.
  SELECT 1 FROM public.news_sources s
  WHERE s.url = v.url OR lower(s.name) = lower(v.name)
);
