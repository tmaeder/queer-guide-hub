-- Profession vocabulary expansion.
--
-- `personalities.profession` was uncontrolled free text (256 distinct strings)
-- and the `professions` taxonomy had only 20 rows that did not cover the real
-- distribution. This migration turns `professions` into the single category-aware
-- controlled vocabulary (slug + aliases[] + category + lucide icon), mirroring the
-- Amenity Truth Engine vocabulary pattern, so a deterministic normalizer can map
-- every raw value to one canonical, correctly-cased term.

ALTER TABLE public.professions
  ADD COLUMN IF NOT EXISTS slug      text,
  ADD COLUMN IF NOT EXISTS aliases   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category  text,
  ADD COLUMN IF NOT EXISTS icon_name text;

-- Backfill slugs for any pre-existing rows so the upsert below can match on slug.
UPDATE public.professions
   SET slug = btrim(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), '-')
 WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS professions_slug_key ON public.professions (slug);

-- Single source of truth for the controlled vocabulary. Existing 20 terms are
-- matched by slug (id preserved) and enriched; 12 new terms are inserted. Each
-- term carries lowercase aliases listing gendered / granular / Wikidata-occupation
-- variants that fold into it.
INSERT INTO public.professions (slug, name, category, icon_name, aliases, sort_order, is_active)
VALUES
  ('actor','Actor','Performance','clapperboard', ARRAY['actress','film actor','television actor','tv actor','stage actor','voice actor','movie actor','theatre actor','theater actor'], 1, true),
  ('activist','Activist','Activism','megaphone', ARRAY['lgbtq rights activist','lgbt rights activist','gay rights activist','queer activist','trans activist','transgender activist','human rights activist','women''s rights activist','womens rights activist','civil rights activist','hiv/aids activist','aids activist','hiv activist','rights activist','campaigner'], 2, true),
  ('artist','Artist','Arts','palette', ARRAY['painter','visual artist','sculptor','street artist','comics artist','comic artist','cartoonist','illustrator','installation artist','contemporary artist'], 3, true),
  ('comedian','Comedian','Performance','laugh', ARRAY['stand-up comedian','stand up comedian','humorist','comedy writer'], 4, true),
  ('composer','Composer','Arts','music', ARRAY['orchestral composer','music composer','film composer','conductor'], 5, true),
  ('director','Director','Media','clapperboard', ARRAY['film director','movie director','theatre director','theater director','stage director','artistic director'], 6, true),
  ('drag-queen','Drag queen','Performance','crown', ARRAY['drag king','drag performer','drag artist','drag entertainer'], 7, true),
  ('fashion-designer','Fashion designer','Arts','scissors', ARRAY['designer','stylist','costume designer','fashion stylist','clothing designer'], 8, true),
  ('journalist','Journalist','Media','newspaper', ARRAY['columnist','reporter','correspondent','news anchor','news presenter'], 9, true),
  ('model','Model','Arts','camera', ARRAY['fashion model','supermodel','glamour model','runway model'], 10, true),
  ('musician','Musician','Performance','music', ARRAY['instrumentalist','pianist','guitarist','drummer','bassist','violinist','cellist','jazz musician','saxophonist','session musician','dj','disc jockey'], 11, true),
  ('photographer','Photographer','Arts','camera', ARRAY['photojournalist','fashion photographer','portrait photographer'], 12, true),
  ('poet','Poet','Arts','pen-tool', ARRAY['poetess','lyricist'], 13, true),
  ('politician','Politician','Politics','landmark', ARRAY['statesman','stateswoman','diplomat','senator','member of parliament','mp','congressman','congresswoman','mayor','governor','councillor','political figure','government official','civil servant'], 14, true),
  ('rapper','Rapper','Performance','mic', ARRAY['hip hop artist','hip-hop artist','hip hop musician','mc','emcee'], 15, true),
  ('researcher','Researcher','Academia','flask-conical', ARRAY['scientist','biologist','chemist','physicist','sociologist','anthropologist','economist','psychologist','computer scientist','political scientist','historian','art historian','professor','university teacher','academic','scholar','philosopher','literary critic','ethnologist','mathematician','neuroscientist'], 16, true),
  ('screenwriter','Screenwriter','Media','file-text', ARRAY['scenarist','tv writer','television writer'], 17, true),
  ('singer','Singer','Performance','mic', ARRAY['vocalist','pop singer','opera singer','jazz singer','soul singer','r&b singer','recording artist'], 18, true),
  ('singer-songwriter','Singer-songwriter','Performance','mic', ARRAY['songwriter','singer and songwriter'], 19, true),
  ('writer','Writer','Arts','pen-tool', ARRAY['novelist','author','essayist','playwright','non-fiction writer','biographer','short story writer','blogger'], 20, true),
  -- New terms covering the audited distribution
  ('adult-performer','Adult performer','Adult','alert-triangle', ARRAY['adult model','adult film actor','adult film actress','adult entertainer','porn star','pornstar','pornographic actor','pornographic actress','porn actor','porn actress','adult video performer','cam model','webcam model','camgirl'], 21, true),
  ('athlete','Athlete','Sports','trophy', ARRAY['association football player','football player','footballer','soccer player','american football player','basketball player','baseball player','tennis player','rugby player','ice hockey player','field hockey player','boxer','golfer','swimmer','sprinter','gymnast','cyclist','professional wrestler','wrestler','athletics competitor','track and field athlete','skier','figure skater','volleyball player','sportsperson','sportsman','sportswoman','olympic athlete'], 22, true),
  ('dancer','Dancer','Performance','footprints', ARRAY['ballerina','ballet dancer','contemporary dancer','choreographer','dance artist'], 23, true),
  ('lawyer','Lawyer','Law','scale', ARRAY['attorney','jurist','barrister','solicitor','legal scholar','judge','advocate','counsel'], 24, true),
  ('teacher','Teacher','Education','graduation-cap', ARRAY['educator','school teacher','high school teacher','lecturer','instructor','tutor'], 25, true),
  ('businessperson','Businessperson','Business','briefcase', ARRAY['businessman','businesswoman','entrepreneur','business executive','ceo','founder','co-founder','investor','business owner'], 26, true),
  ('producer','Producer','Media','clapperboard', ARRAY['film producer','music producer','television producer','record producer','executive producer','theatre producer'], 27, true),
  ('tv-presenter','TV presenter','Media','tv', ARRAY['television presenter','presenter','tv host','television host','talk show host','game show host','television personality'], 28, true),
  ('youtuber','YouTuber','Media','youtube', ARRAY['content creator','social media influencer','influencer','video blogger','vlogger','streamer','twitch streamer','internet personality','social media personality'], 29, true),
  ('military','Military','Service','shield', ARRAY['military personnel','military officer','soldier','army officer','naval officer','veteran','service member','general','colonel'], 30, true),
  ('entertainer','Entertainer','Performance','sparkles', ARRAY['performer','radio personality','radio host','radio presenter','showman'], 31, true),
  ('make-up-artist','Make-up artist','Arts','brush', ARRAY['makeup artist','make up artist','special effects artist','mua'], 32, true)
ON CONFLICT (slug) DO UPDATE SET
  name      = EXCLUDED.name,
  category  = EXCLUDED.category,
  icon_name = EXCLUDED.icon_name,
  aliases   = EXCLUDED.aliases,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();
