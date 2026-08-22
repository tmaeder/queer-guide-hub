-- German→English profession vocabulary.
--
-- ROOT CAUSE this migration fixes: public.professions held 35 canonical terms and
-- 263 aliases, ALL ENGLISH — while ~90% of the 1,440 distinct values in
-- personalities.profession are German, and 330 of the 1,630 public personalities
-- rendered a German profession on the live site. normalize_profession() is already
-- a pure `name ∪ alias ∪ slug` lookup, so it never had anything to match the corpus
-- against and fell through to its initcap() passthrough. The lever is DATA, not code.
--
-- Three parts:
--   (1) 8 new canonical terms for concepts the vocabulary genuinely lacked,
--   (2) German aliases on all 43 rows,
--   (3) is_active=false rows for strings that are NOT professions, so
--       normalize_profession can reject them explicitly instead of initcapping
--       them into the column.
--
-- CANONICAL-VS-ALIAS RULE. A German stem earns its own canonical row only if all
-- three hold: (a) it is not semantically inside an existing canonical, (b) ≥5 rows
-- after folding every gender spelling together, (c) a user would plausibly filter
-- on it. That is why Wrestler/Schwimmer/Reiter are aliases of `athlete`, Lyriker of
-- `poet` and Biologe of `researcher` — and why `nurse` (Krankenpfleger, 4 rows),
-- `curator` (Kurator, 4) and `editor` (Redakteur, 10 — folded onto `journalist`)
-- did NOT earn one. A canonical with two members is a facet chip nobody clicks and
-- a /professions/:x page with two faces.
--
-- ALIASES ARE APPENDED, NEVER REPLACED. The seed at 20260608200003 used
-- `DO UPDATE SET aliases = EXCLUDED.aliases`; reusing that shape here would delete
-- all 263 curated English aliases, taking `hiv/aids activist`, `r&b singer` and
-- `porn star` with them.
--
-- SPELLING COVERAGE. normalize_profession v2 (next migration) generates the
-- gender/umlaut variants of its INPUT, so only the masculine stem needs an entry:
-- "Schauspieler/in", "Schauspieler:in", "Schauspielerin" and "Schauspieler*innen"
-- all reach `schauspieler`. Umlaut-bearing stems are stored in BOTH spellings
-- because the folding runs input→stored, so a corpus value that is already folded
-- ("Saenger") would otherwise miss a stored "sänger".

-- ---------------------------------------------------------------------------
-- 1. New canonical terms
-- ---------------------------------------------------------------------------
INSERT INTO public.professions (slug, name, category, icon_name, sort_order, aliases, is_active)
VALUES
  ('physician', 'Physician', 'Health', 'stethoscope', 33, ARRAY[
     'doctor','medical doctor','surgeon','psychiatrist',
     'arzt','ärztin','aerztin','arztin','mediziner','medizinerin',
     'chirurg','psychiater','facharzt','hausarzt','allgemeinmediziner'
   ], true),
  ('chef', 'Chef', 'Service', 'chef-hat', 34, ARRAY[
     'cook','restaurateur','pastry chef',
     'koch','köchin','koechin','kochin','küchenchef','kuechenchef','kuchenchef',
     'chefkoch','gastronom','konditor'
   ], true),
  ('architect', 'Architect', 'Arts', 'ruler', 35, ARRAY[
     'interior architect','landscape architect',
     'architekt','innenarchitekt','landschaftsarchitekt','stadtplaner'
   ], true),
  ('religious-leader', 'Religious leader', 'Service', 'church', 36, ARRAY[
     'priest','bishop','rabbi','pastor','chaplain','cleric','clergy','nun','monk',
     'theologian','imam',
     'geistlicher','geistliche','kleriker','priester','pfarrer','pastorin',
     'rabbiner','bischof','bischöfin','bischoefin','bischofin',
     'nonne','mönch','moench','monch','theolog','theologe','kaplan','seelsorger'
   ], true),
  ('translator', 'Translator', 'Arts', 'languages', 37, ARRAY[
     'interpreter','literary translator',
     'übersetzer','uebersetzer','ubersetzer','dolmetscher','literaturübersetzer'
   ], true),
  ('publisher', 'Publisher', 'Media', 'book-open', 38, ARRAY[
     'editor','book publisher','publishing editor',
     'verleger','herausgeber','lektor','buchverleger','zeitschriftenverleger'
   ], true),
  ('hairdresser', 'Hairdresser', 'Service', 'scissors', 39, ARRAY[
     'hairstylist','barber',
     'friseur','frisör','frisoer','frisor','coiffeur','barbier'
   ], true),
  ('sex-worker', 'Sex worker', 'Service', 'shield', 40, ARRAY[
     'sex worker','sexworker','escort',
     'sexarbeiter','sexarbeiterin','prostituierte'
   ], true)
ON CONFLICT (slug) DO UPDATE SET
  name       = EXCLUDED.name,
  category   = COALESCE(public.professions.category, EXCLUDED.category),
  sort_order = EXCLUDED.sort_order,
  is_active  = true,
  aliases    = (SELECT array_agg(DISTINCT a ORDER BY a)
                FROM unnest(public.professions.aliases || EXCLUDED.aliases) a),
  updated_at = now();

-- `sex-worker` is a DIFFERENT concept from `adult-performer` and must never be
-- swept into the adult cohort. Safe because 20260916100000 moved that cohort onto
-- the is_adult flag (unioned with the legacy patterns), and none of the strings
-- above contain 'adult', 'porn', 'adult model' or 'adult film'.

-- ---------------------------------------------------------------------------
-- 2. German aliases on the existing canonicals
--
-- Harvested from the two curated maps this repo already shipped —
-- supabase/functions/_shared/profession-keywords.js (PROFESSION_ALIASES) and
-- src/lib/professionDisplay.ts (GERMAN_PROFESSIONS) — then extended from the
-- ranked list of corpus stems with no vocabulary match. Neither source is
-- modified: profession-keywords.js scores Wikidata P106 labels for namesake
-- detection and its own header documents that drift there "silently reclassifies
-- real historical figures as namesake conflicts".
-- ---------------------------------------------------------------------------
INSERT INTO public.professions (slug, name, category, sort_order, aliases, is_active)
VALUES
  -- 441 rows: Schauspieler/in + Schauspielerin + Schauspieler:in. "Sprecher" is a
  -- voice actor here — it occurs almost only as "Schauspieler/in; Sprecher/in".
  ('actor', 'Actor', 'Performance', 1, ARRAY[
     'schauspieler','darsteller','sprecher','synchronsprecher',
     'filmschauspieler','theaterschauspieler','buehnendarsteller'], true),

  -- 467 rows. 'lgbtq+ rights activist' is the single largest ENGLISH miss (270
  -- rows): the existing aliases spell it 'lgbtq rights activist', and the '+'
  -- meant an exact-match lookup never fired.
  ('activist', 'Activist', 'Activism', 2, ARRAY[
     'lgbtq+ rights activist','lgbt+ rights activist','lgbtqia+ rights activist',
     'aktivist','lgbt-aktivist','lgbtq-aktivist','lgbtq+-aktivist',
     'transgender-aktivist','trans-aktivist','intersex-aktivist','aids-aktivist',
     'menschenrechtsaktivist','bürgerrechtler','buergerrechtler','burgerrechtler',
     'frauenrechtler','umweltaktivist'], true),

  -- 473 rows Schriftsteller + 345 Autor + 34 Dramatiker.
  ('writer', 'Writer', 'Arts', 20, ARRAY[
     'memoirist','librettist',
     'schriftsteller','autor','dramatiker','romanautor','krimiautor',
     'kochbuchautor','food-autor','sachbuchautor','kinderbuchautor',
     'essayist','publizist','chronist','erzähler','erzaehler','erzahler'], true),

  ('screenwriter', 'Screenwriter', 'Media', 17, ARRAY[
     'drehbuchautor','drehbuchschreiber'], true),

  -- 186 rows: Dichter + Lyriker are one concept in English.
  ('poet', 'Poet', 'Arts', 13, ARRAY[
     'slam poet','slam-poet',
     'dichter','lyriker','poetin'], true),

  ('politician', 'Politician', 'Politics', 14, ARRAY[
     'politiker','abgeordneter','abgeordnete','bürgermeister','buergermeister',
     'burgermeister','staatsmann','regierungsbeamter','parlamentarier',
     'senatorin','ministerpräsident','ministerprasident'], true),

  ('singer', 'Singer', 'Performance', 18, ARRAY[
     'sänger','saenger','sanger','opernsänger','opernsaenger','opernsanger',
     'popsänger','popsaenger','country-sänger','country-saenger','chansonnier'], true),

  ('artist', 'Artist', 'Arts', 3, ARRAY[
     'performance artist',
     'künstler','kuenstler','kunstler','maler','bildhauer','zeichner','grafiker',
     'comiczeichner','karikaturist','modeillustrator','performancekünstler',
     'performancekuenstler','performancekunstler','performance-künstler',
     'performance-kuenstler','konzeptkünstler','konzeptkuenstler',
     'bühnenbildner','buehnenbildner','buhnenbildner','bühnenbildnern'], true),

  ('musician', 'Musician', 'Performance', 11, ARRAY[
     'experimental musician',
     'musiker','dirigent','gitarrist','schlagzeuger','geiger','jazzmusiker',
     'orchestermusiker'], true),

  ('composer', 'Composer', 'Arts', 5, ARRAY['komponist','liedkomponist'], true),

  ('dancer', 'Dancer', 'Performance', 23, ARRAY[
     'tänzer','taenzer','tanzer','balletttänzer','balletttaenzer','balletttanzer',
     'choreograf','choreograph','tanzpädagoge'], true),

  ('director', 'Director', 'Media', 6, ARRAY[
     'regisseur','filmregisseur','theaterregisseur','opernregisseur',
     'filmemacher','dokumentarfilmer'], true),

  ('producer', 'Producer', 'Media', 27, ARRAY[
     'produzent','filmproduzent','musikproduzent','fernsehproduzent'], true),

  ('photographer', 'Photographer', 'Arts', 12, ARRAY[
     'fotograf','photograph','modefotograf'], true),

  ('comedian', 'Comedian', 'Performance', 4, ARRAY[
     'komiker','kabarettist','stand-up-comedian'], true),

  -- Redakteur/Chefredakteur fold here rather than earning an `editor` canonical
  -- (10 rows). Kritiker in this corpus is a culture/film reviewer, i.e. a columnist.
  ('journalist', 'Journalist', 'Media', 9, ARRAY[
     'journalist','redakteur','chefredakteur','kolumnist','korrespondent',
     'kritiker','kunstkritiker','kulturkritiker','literaturkritiker','filmkritiker',
     'nachrichtensprecher','reporterin'], true),

  ('tv-presenter', 'TV presenter', 'Media', 28, ARRAY[
     'moderator','fernsehmoderator','talkmaster','gastgeber',
     'tv-persönlichkeit','tv-persoenlichkeit','tv-personlichkeit',
     'fernsehpersönlichkeit','fernsehpersoenlichkeit'], true),

  ('youtuber', 'YouTuber', 'Media', 29, ARRAY[
     'creator','internet-persönlichkeit','internet-persoenlichkeit',
     'internet-personlichkeit','webvideoproduzent'], true),

  ('athlete', 'Athlete', 'Sports', 22, ARRAY[
     'rugby union player','curler','judoka',
     'sportler','fußballspieler','fussballspieler','basketballspieler',
     'baseballspieler','american-football-spieler','handballspieler',
     'volleyballspieler','tennisspieler','leichtathlet','schwimmer','reiter',
     'mma-kämpfer','mma-kaempfer','mma-kampfer','eiskunstläufer','eiskunstlaeufer',
     'eiskunstlaufer','skirennläufer','skirennlaeufer','skirennlaufer',
     'bergsteiger','radrennfahrer','turner','ringer','fechter','sportlerin'], true),

  ('model', 'Model', 'Arts', 10, ARRAY['modell','fotomodell'], true),

  ('fashion-designer', 'Fashion designer', 'Arts', 8, ARRAY[
     'modedesigner','modeschöpfer','modeschoepfer','modeschopfer',
     'kostümbildner','kostuembildner','kostumbildner'], true),

  ('researcher', 'Researcher', 'Academia', 16, ARRAY[
     'wissenschaftler','historiker','kunsthistoriker','literaturwissenschaftler',
     'sprachwissenschaftler','soziolog','soziologe','anthropolog','anthropologe',
     'biolog','biologe','genetiker','physiker','chemiker','informatiker',
     'philosoph','psycholog','psychologe','psychoanalytiker',
     'archäolog','archaeolog','archaolog','archäologe','akademiker','theoretiker',
     'altphilologe','klassischer philologe'], true),

  ('teacher', 'Teacher', 'Education', 25, ARRAY[
     'lehrer','hochschullehrer','dozent','pädagog','paedagog','padagog',
     'pädagoge','erzieher'], true),

  ('lawyer', 'Lawyer', 'Law', 24, ARRAY[
     'anwalt','anwält','anwaelt','rechtsanwalt','richter','bundesrichter',
     'staatsanwalt','notar','jurist'], true),

  ('businessperson', 'Businessperson', 'Business', 26, ARRAY[
     'salesperson',
     'unternehmer','manager','geschäftsmann','geschaeftsmann','geschaftsmann',
     'geschäftsfrau','buchhalter','gastwirt','verkäufer','kaufmann'], true),

  ('military', 'Military', 'Service', 30, ARRAY[
     'soldat','offizier','feldherr','marineoffizier','generalin'], true),

  ('entertainer', 'Entertainer', 'Performance', 31, ARRAY[
     'performer','ballroom-performer',
     'zauberkünstler','zauberkuenstler','zauberkunstler','magier',
     'varietékünstler','varietekuenstler'], true),

  ('drag-queen', 'Drag queen', 'Performance', 7, ARRAY[
     'dragqueen','dragking',
     'drag-künstler','drag-kuenstler','drag-kunstler','dragkünstler',
     'dragkuenstler','dragkunstler','drag-performer',
     'travestiekünstler','travestiekuenstler','travestiekunstler'], true),

  ('singer-songwriter', 'Singer-songwriter', 'Performance', 19, ARRAY[
     'texter','liedtexter','songschreiber'], true)
ON CONFLICT (slug) DO UPDATE SET
  aliases    = (SELECT array_agg(DISTINCT a ORDER BY a)
                FROM unnest(public.professions.aliases || EXCLUDED.aliases) a),
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Known NON-professions, as inactive rows
--
-- Bare category words the Wikipedia import dropped into the column ("Kunst",
-- "Politik", "Musik / Schauspiel"). They are real facets but not occupations, so
-- normalize_profession returns NULL for them rather than storing "Kunst" as
-- somebody's job. Storing them as rows instead of a hardcoded denylist keeps the
-- list admin-editable through the existing CMS aliases field, and every existing
-- matcher filters `WHERE is_active`, so an inactive row can never be MATCHED —
-- only the explicit reject tier looks at them.
--
-- Deliberately NOT listed here: nobility and regnal titles ("König von Preußen",
-- "Römischer Kaiser", "Adliger", ~38 rows). Those describe a real historical
-- station and rejecting them asserts more than the data supports; they stay in
-- profession_review_queue for a human.
-- ---------------------------------------------------------------------------
INSERT INTO public.professions (slug, name, category, sort_order, aliases, is_active)
VALUES
  ('nonprofession-kunst',         'Kunst',           'Non-profession', 900, ARRAY['kunst','bildende kunst'], false),
  ('nonprofession-politik',       'Politik',         'Non-profession', 900, ARRAY['politik'], false),
  ('nonprofession-literatur',     'Literatur',       'Non-profession', 900, ARRAY['literatur','lyrik'], false),
  ('nonprofession-musik',         'Musik',           'Non-profession', 900, ARRAY['musik'], false),
  ('nonprofession-tanz',          'Tanz',            'Non-profession', 900, ARRAY['tanz'], false),
  ('nonprofession-schauspiel',    'Schauspiel',      'Non-profession', 900, ARRAY['schauspiel'], false),
  ('nonprofession-performance',   'Performance',     'Non-profession', 900, ARRAY['performance'], false),
  ('nonprofession-comedy',        'Comedy',          'Non-profession', 900, ARRAY['comedy'], false),
  ('nonprofession-community',     'Community',       'Non-profession', 900, ARRAY['community'], false),
  ('nonprofession-dienstleistung','Dienstleistung',  'Non-profession', 900, ARRAY['dienstleistung'], false),
  ('nonprofession-film',          'Film',            'Non-profession', 900, ARRAY['film','fernsehen','film & fernsehen'], false),
  ('nonprofession-mode',          'Mode',            'Non-profession', 900, ARRAY['mode'], false),
  ('nonprofession-wissenschaft',  'Wissenschaft',    'Non-profession', 900, ARRAY['wissenschaft'], false)
ON CONFLICT (slug) DO UPDATE SET
  is_active  = false,
  category   = 'Non-profession',
  aliases    = (SELECT array_agg(DISTINCT a ORDER BY a)
                FROM unnest(public.professions.aliases || EXCLUDED.aliases) a),
  updated_at = now();

COMMENT ON COLUMN public.professions.aliases IS
  'Alternative spellings matched by normalize_profession (case-insensitively, after '
  'gender/umlaut folding of the INPUT). German forms live here — only the masculine '
  'stem is needed. Umlaut stems are stored in both spellings because folding runs '
  'input->stored. Rows with is_active=false are the explicit reject list.';
