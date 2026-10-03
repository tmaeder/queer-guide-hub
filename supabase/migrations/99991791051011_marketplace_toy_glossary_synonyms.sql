-- Glossary spellings -> marketplace search (2026-10-03 glossary pass, part 2).
--
-- The companion migration (…042588) created fifteen fine buckets for the toy
-- classes that had no home. This one handles the OTHER ~165 glossary terms,
-- which are NOT categories and must not become any: a reader who types
-- "Fleshlight", "Ben Wa balls" or "Hitachi" is naming a BRAND or a colloquial
-- spelling of a product class the catalogue already carries, and the right
-- answer is to route the query, not to mint a tile.
--
-- WHAT IS DELIBERATELY NOT HERE, each for its own reason:
--   * MATERIALS (silicone, TPE, cyberskin, jelly, pyrex, acrylic) — already
--     carried by the `mat-*` attribute tags, which is the correct axis. A
--     synonym here would compete with a working facet.
--   * AUDIENCE LABELS ("Sex Toys For Women", "Heterosexual Toys", "Lesbian
--     Toys", "Sex Toys For Men") — the gendered framing this codebase has
--     repeatedly repaired OUT of the glossary. Not a category, and not a
--     search rewrite either: encoding it here would reintroduce the framing
--     one layer down, where nobody is looking for it. The constituent words
--     ("toys", "dildo") already match on their own.
--   * UMBRELLA MARKETING TERMS (Adult Toys, Marital Aid, Sexy Gifts,
--     "Sensual Intelligence Technology") — they name no product class.
--
-- STATUS IS 'active', NOT 'approved', AND THAT IS LOAD-BEARING. The worker
-- fetches `search_synonyms?status=eq.active` (workers/search-proxy/src/
-- pgSynonyms.ts). Measured on prod while writing this: 617 rows sit at
-- 'approved' against 58 at 'active' — i.e. 617 synonyms were approved by
-- somebody and have never been loaded by anything. Those are NOT touched here:
-- activating 617 rows at once moves search results across the whole site and
-- is a decision of its own, not a side effect of a glossary pass. It is
-- recorded in the PR instead.
--
-- INDEXES IS ['marketplace'] rather than empty. An empty array means "every
-- index", and `expandWithPgSynonyms` does SUBSTRING matching — so a row like
-- "wand -> massager, vibrator" left unscoped would fire on a venue or news
-- search too. Scoping costs nothing and bounds the blast radius.
--
-- is_one_way = true throughout: "fleshlight" should find strokers, but
-- someone searching "stroker" should not have "fleshlight" (a trademark)
-- appended to their query.

INSERT INTO public.search_synonyms (terms, replacements, locale, indexes, is_one_way, status, source, notes)
VALUES
  -- ── Brands and trademarks -> the product class they belong to ─────────────
  (ARRAY['fleshlight'],        ARRAY['masturbator','stroker','sleeve'],      '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03: brand -> class'),
  (ARRAY['tenga'],             ARRAY['masturbator','stroker','egg'],         '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03: brand -> class'),
  (ARRAY['autoblow'],          ARRAY['masturbator','stroker','automatic'],   '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03: brand -> class'),
  (ARRAY['bad dragon'],        ARRAY['fantasy','dildo'],                     '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03: brand -> class'),
  (ARRAY['hitachi','magic wand','doxy','wahl'], ARRAY['wand','massager','vibrator'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03: brand -> class'),
  (ARRAY['satisfyer','womanizer'], ARRAY['air pulse','clitoral','suction'],  '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03: brand -> class'),

  -- ── Colloquial spellings of a class the catalogue already carries ────────
  (ARRAY['ben wa balls','jiggle balls','kegel balls','kegel eggs','love egg'], ARRAY['kegel','liebeskugeln'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['pegging','pegger'],  ARRAY['strap on','harness','dildo'],           '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['strapless strap-on','strapless strapon'], ARRAY['strap on','dildo'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['pocket rocket','silver bullet'], ARRAY['bullet','vibrator'],        '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['butterfly vibrator'], ARRAY['clitoral','wearable'],                 '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['panty vibrator','knicker vibrator'], ARRAY['wearable','panty'],     '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['anal pearls','string of pearls','training beads'], ARRAY['anal beads'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['anal plug','inflatable plug','training plug'], ARRAY['butt plug'],  '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['drilldo','fuck machine','sex drill','power spinner','rotobator'], ARRAY['sex machine','machine'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['heeldo','ovipositor','monster dildo'], ARRAY['fantasy','dildo'],    '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['cock cage','sperm stopper'], ARRAY['chastity','cage'],              '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['gimp mask','blindfold'], ARRAY['hood','mask'],                      '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['spider gag','ball gag','bit gag','muzzle'], ARRAY['gag'],           '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['sleep sack','queening stool','sex swing','sex ramp','sex pillow','thrusting chair','bdsm furniture'], ARRAY['sling','furniture','swing'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['humbler','figging','ball crusher','genital clamp'], ARRAY['cbt','impact'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['cattle prod','violet wand','electric pinwheel'], ARRAY['estim','electro'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['urethra probe','urethral sound'], ARRAY['sounding','urethral'],     '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['anal douche','enema kit','enema wand','anal shower','intimate shower'], ARRAY['douche','enema'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['girth enhancer','penis sleeve','cock sheath'], ARRAY['sleeve','sheath'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['penis extender','penis enlarger'], ARRAY['extender','pump'],        '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['clit pump','nipple pump','cupping'], ARRAY['pump'],                 '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['lube shooter','lube launcher','lube applicator'], ARRAY['lube','applicator'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['dental dam'],        ARRAY['dam','safer sex'],                      '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['app controlled','remote control toy','smart toy','bluetooth toy','long distance toy'], ARRAY['app','remote','bluetooth'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['air wave','sonic stimulation','pressure wave','suction toy','clitoral sucker'], ARRAY['air pulse','suction','clitoral'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['g-spot stimulator','g spot stimulator'], ARRAY['g spot'],           '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['prostate massager','p-spot','p spot'], ARRAY['prostate'],           '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['anal hook'],         ARRAY['hook'],                                 '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['dilation toy','stretching toy','anal dilator'], ARRAY['dilator','training'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['puppy hood','pup mask','pony gear','puppy tail'], ARRAY['pup play','hood','tail'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['stand to pee','packing toy'], ARRAY['packer','stp'],                '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['aphrodisiac','libido enhancer','sex stimulant'], ARRAY['aphrodisiac','libido'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['body chocolate','edible panties','body paint'], ARRAY['edible','body paint'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['double penetration','dp toy'], ARRAY['double','couples'],           '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['tongue vibrator','licking toy','oral simulator'], ARRAY['tongue','licking'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['love doll','inflatable doll','blow up doll'], ARRAY['doll','torso'], '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['nipple clamp','nipple clip'], ARRAY['nipple','clamp'],              '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['spreader bar','leg spreader'], ARRAY['spreader'],                   '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['shackles','manacles','handcuff'], ARRAY['cuffs','restraints'],      '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['riding crop','flogging toy'], ARRAY['crop','flogger','impact'],     '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03'),
  (ARRAY['shibari rope','bondage rope'], ARRAY['rope','shibari'],             '*', ARRAY['marketplace'], true, 'active', 'manual', 'glossary 2026-10-03')
ON CONFLICT DO NOTHING;

-- ── Postcondition ───────────────────────────────────────────────────────────
-- Asserts the REACHED STATE, not an insert count: `ON CONFLICT DO NOTHING`
-- makes a re-run add zero rows, and a count assertion would fail on the second
-- apply while the data is perfectly correct.
DO $verify$
DECLARE
  v_rows integer;
  v_bad  text;
BEGIN
  SELECT count(*) INTO v_rows FROM public.search_synonyms
  WHERE notes LIKE 'glossary 2026-10-03%' AND status = 'active';
  IF v_rows < 40 THEN
    RAISE EXCEPTION 'glossary synonyms did not land: % active rows', v_rows;
  END IF;

  -- Every row must be loadable by the worker, which reads status=active only.
  -- A row written as 'approved' here would be silently inert — the exact
  -- condition this file documents for the 617 pre-existing rows.
  SELECT string_agg(DISTINCT status, ', ') INTO v_bad FROM public.search_synonyms
  WHERE notes LIKE 'glossary 2026-10-03%' AND status <> 'active';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'glossary synonyms written in a status the worker never loads: %', v_bad;
  END IF;

  -- And scoped to the marketplace index — unscoped rows fire on venue and
  -- news queries too, because expansion is substring-based.
  IF EXISTS (SELECT 1 FROM public.search_synonyms
             WHERE notes LIKE 'glossary 2026-10-03%'
               AND (indexes IS NULL OR NOT (indexes @> ARRAY['marketplace']))) THEN
    RAISE EXCEPTION 'a glossary synonym is not scoped to the marketplace index';
  END IF;

  RAISE NOTICE 'glossary synonyms active: %', v_rows;
END $verify$;
