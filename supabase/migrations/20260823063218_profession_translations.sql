-- profession_translations — a German→English tier between the vocabulary and the
-- fallback, plus the one-shot repair of the rows already stored in German.
--
-- WHY A TABLE AND NOT AN UPDATE. The 145 German values below have no home in the
-- 35-term `professions` vocabulary: a Straßenbahnschaffner is not an Actor, an
-- Activist or any of the other 33, and widening the vocabulary to hold them would
-- change the People page facet chips and the /professions/:name filter, which are
-- driven by that same table. A plain UPDATE would fix today's rows and nothing
-- else — the next German string to arrive would land in `fallback` exactly as
-- these did. Making it a lookup consulted by normalize_profession_full() means the
-- write gate translates on write from now on, and extending it is an INSERT rather
-- than a migration to the function.
--
-- WHY NOT `professions.aliases`. Aliases map a spelling onto a canonical vocabulary
-- term. These are not spellings of the 35 terms; they are different professions
-- that simply need to be in English. Conflating the two would make `Papst` a
-- spelling of some unrelated canonical, which is how the drag-king collapse
-- happened (see 20260822223231).
--
-- SCOPE. English-looking values already in the queue (Botanist, Filmmaker,
-- Podcaster, Cinematographer, Zuni lhamana, …) are deliberately NOT touched. They
-- are correct professions that merely sit outside a 35-term controlled vocabulary;
-- "not in the vocabulary" is not a defect, and rewriting them would be churn.
--
-- Three values resolve to NULL rather than to a translation, because they are not
-- professions at all: a charitable organisation is not a person's job, and
-- `Lebte als „George Hamilton"` ("lived as …") is a biographical note about
-- someone living under an assumed identity — publishing it in the profession slot
-- both misinforms and, for a trans or gender-nonconforming person, foregrounds a
-- prior identity in a field meant to say what they did.

CREATE TABLE IF NOT EXISTS public.profession_translations (
  source_term text PRIMARY KEY,
  english     text,            -- NULL = "this is not a profession", drop the value
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profession_translations IS
  'Non-English profession strings -> English. Consulted by normalize_profession_full() '
  'after the vocabulary lookup and before the fallback tier. A NULL english means the '
  'source term is not a profession and the value should be cleared. Extend with INSERTs; '
  'no migration to the function is needed.';

ALTER TABLE public.profession_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profession_translations_read ON public.profession_translations;
CREATE POLICY profession_translations_read ON public.profession_translations
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.profession_translations TO anon, authenticated;

INSERT INTO public.profession_translations (source_term, english, note) VALUES
  ('adliger','Noble',NULL),
  ('anglikanischer priester','Anglican priest',NULL),
  ('animatorin','Animator',NULL),
  ('arbeiter','Labourer',NULL),
  ('architekturkritiker','Architecture critic',NULL),
  ('astrolog','Astrologer',NULL),
  ('astronautin','Astronaut',NULL),
  ('astronom','Astronomer',NULL),
  ('astrophysikerin','Astrophysicist',NULL),
  ('ballettimpresario','Ballet impresario',NULL),
  ('ballroom-mutter','Ballroom house mother',NULL),
  ('baptistischer pfarrer','Baptist minister',NULL),
  ('beamter','Civil servant',NULL),
  ('bergmann','Miner',NULL),
  ('biochemiker','Biochemist',NULL),
  ('biografin','Biographer',NULL),
  ('blockflötist','Recorder player',NULL),
  ('bogenschütz','Archer',NULL),
  ('botschaftsmitarbeiter','Embassy officer',NULL),
  ('büroangestellter','Office clerk',NULL),
  ('busfahrer','Bus driver',NULL),
  ('cricketspieler','Cricketer',NULL),
  ('dachdecker','Roofer',NULL),
  ('dienstbote','Domestic worker',NULL),
  ('dragperformerin','Drag performer',NULL),
  ('eisschnellläufer','Speed skater',NULL),
  ('elektriker','Electrician',NULL),
  ('entfesselungskünstler','Escape artist',NULL),
  ('erzherzog von österreich','Archduke of Austria',NULL),
  ('eventveranstalter','Event organiser',NULL),
  ('evolutionsbiolog','Evolutionary biologist',NULL),
  ('ex-schweizergardist','Former Swiss Guard',NULL),
  ('färber','Dyer',NULL),
  ('fernsehmanagerin','Television executive',NULL),
  ('filmeditor','Film editor',NULL),
  ('fitness-instruktor','Fitness instructor',NULL),
  ('fitnesstrainer','Fitness trainer',NULL),
  ('food-kritiker','Food critic',NULL),
  ('franziskaner','Franciscan friar',NULL),
  ('freestyle-skier','Freestyle skier',NULL),
  ('fußballtorhüter','Goalkeeper',NULL),
  ('gastgewerbe','Hospitality worker',NULL),
  ('geheimagent','Secret agent',NULL),
  ('germanist','Germanist',NULL),
  ('gospel-saenger','Gospel singer',NULL),
  ('großhandelskaufmann','Wholesale merchant',NULL),
  ('handlungsgehilfe','Shop assistant',NULL),
  ('hausangestellte','Domestic worker',NULL),
  ('hausierer','Pedlar',NULL),
  ('herzog von orléans','Duke of Orléans',NULL),
  ('hochschuladministrator','University administrator',NULL),
  ('hochschulprofessor','University professor',NULL),
  ('hochschulrektorin','University rector',NULL),
  ('höfling','Courtier',NULL),
  ('hüttenarbeiter','Foundry worker',NULL),
  ('industrie-erbe','Industrial heir',NULL),
  ('ingenieur','Engineer',NULL),
  ('investmentbanker','Investment banker',NULL),
  ('jaeger','Hunter',NULL),
  ('journalistin-moderatorin','Journalist and presenter',NULL),
  ('jugendbuchautor','Children''s author',NULL),
  ('jugendbund-gründer','Youth movement founder',NULL),
  ('kabaka von buganda','Kabaka of Buganda',NULL),
  ('kaiser','Emperor',NULL),
  ('kampfsportler','Martial artist',NULL),
  ('kanut','Canoeist',NULL),
  ('kardinal','Cardinal',NULL),
  ('klavierlehrer','Piano teacher',NULL),
  ('könig von bayern','King of Bavaria',NULL),
  ('könig von england','King of England',NULL),
  ('könig von makedonien','King of Macedon',NULL),
  ('könig von preußen','King of Prussia',NULL),
  ('könig von schweden','King of Sweden',NULL),
  ('königin von schweden','Queen of Sweden',NULL),
  ('korbmacherin','Basket weaver',NULL),
  ('kostümdesigner','Costume designer',NULL),
  ('krankenpflegeschüler','Student nurse',NULL),
  ('kräuterheiler','Herbalist',NULL),
  ('kriegerin','Warrior',NULL),
  ('kulinarikhistoriker','Food historian',NULL),
  ('künstlerduo','Artist duo',NULL),
  ('kunstsammler','Art collector',NULL),
  ('läufer','Runner',NULL),
  ('lgbti-aktivist','LGBTI activist',NULL),
  ('lgbtiq-aktivist','LGBTIQ activist',NULL),
  ('marineflieger','Naval aviator',NULL),
  ('marketingunternehmer','Marketing entrepreneur',NULL),
  ('mathematiker','Mathematician',NULL),
  ('mäzen','Patron of the arts',NULL),
  ('medizinmann','Medicine man',NULL),
  ('milchhändler','Milkman',NULL),
  ('militaerarzt','Military physician',NULL),
  ('museologe','Museologist',NULL),
  ('nachrichtenmoderatorin','News anchor',NULL),
  ('nasa-mitarbeiter','NASA employee',NULL),
  ('neurobiolog','Neurobiologist',NULL),
  ('nsa-mitarbeiter','NSA employee',NULL),
  ('oberst','Colonel',NULL),
  ('ökonomin','Economist',NULL),
  ('papst','Pope',NULL),
  ('parlamentsstenograf','Parliamentary stenographer',NULL),
  ('philanthrop','Philanthropist',NULL),
  ('pirat','Pirate',NULL),
  ('plakatmaler','Poster painter',NULL),
  ('polizist','Police officer',NULL),
  ('polsterer','Upholsterer',NULL),
  ('postbeamter','Postal official',NULL),
  ('postkutscher','Stagecoach driver',NULL),
  ('prediger','Preacher',NULL),
  ('prinzessin von parma','Princess of Parma',NULL),
  ('privatzoo-betreiber','Private zoo owner',NULL),
  ('rancharbeiter','Ranch hand',NULL),
  ('rechtshistoriker','Legal historian',NULL),
  ('reichsbahnbeamter','Railway official',NULL),
  ('römischer kaiser','Roman emperor',NULL),
  ('ruderer','Rower',NULL),
  ('rugbyspieler','Rugby player',NULL),
  ('schiedsrichter','Referee',NULL),
  ('schmied','Blacksmith',NULL),
  ('schönheitskönigin','Beauty queen',NULL),
  ('skilangläufer','Cross-country skier',NULL),
  ('sozialpsychologin','Social psychologist',NULL),
  ('sozialreformer','Social reformer',NULL),
  ('sportlehrer','Physical education teacher',NULL),
  ('straßenbahnschaffner','Tram conductor',NULL),
  ('szenenbildner','Production designer',NULL),
  ('taekwondoin','Taekwondo athlete',NULL),
  ('tagebuchautor','Diarist',NULL),
  ('theater-schauspieler','Stage actor',NULL),
  ('theaterproduzent','Theatre producer',NULL),
  ('trampolinturner','Trampoline gymnast',NULL),
  ('trapezkünstler','Trapeze artist',NULL),
  ('triathlet','Triathlete',NULL),
  ('tv-moderator','TV presenter',NULL),
  ('us-marine','US Marine',NULL),
  ('veranstalter','Event promoter',NULL),
  ('verwaltungsbeamt','Administrative official','v2 over-strip of Verwaltungsbeamter/in'),
  ('wahlmagistrat','Elected magistrate',NULL),
  ('wäscher','Launderer',NULL),
  ('wasserspringer','Diver',NULL),
  ('widerstandskämpfer','Resistance fighter',NULL),
  ('wirt','Innkeeper',NULL),
  ('yogalehrerin','Yoga teacher',NULL),
  ('zehnkämpfer','Decathlete',NULL),
  ('zen-lehrer','Zen teacher',NULL),
  ('zen-priester','Zen priest',NULL),
  ('zirkuskünstler','Circus performer',NULL),
  -- Not professions. NULL clears the column; the raw string stays in
  -- enrichment_status.profession.raw, so every one of these is reversible.
  ('charitable organization',NULL,'an organisation, not a person''s profession'),
  ('lebte als „george hamilton"',NULL,'biographical note, not a profession'),
  ('lebte als „giovanni bordoni"',NULL,'biographical note, not a profession')
ON CONFLICT (source_term) DO UPDATE
  SET english = EXCLUDED.english, note = EXCLUDED.note;
