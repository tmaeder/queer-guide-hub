-- Glossary descriptions, batch 11: the spelling axis.
--
-- WHAT THE PUBLISHED RULE ACTUALLY SAYS. styleguide_rules carries `spelling-and-units`
-- at severity `should`: "Follow the source material's spelling; otherwise American."
-- That is NOT "always American". It has an explicit exception, and the exception does
-- most of the work here: a Wikipedia-derived encyclopedic lead, a WHO classification
-- and a binomial genus name all keep the spelling their source uses. So a regex hit is
-- a CANDIDATE, never a defect, and every row below was read in full before it was taken.
--
-- WHY THIS IS AN INCONSISTENCY AND NOT A HOUSE DIALECT — measured, not asserted.
-- Across the 3,545 active descriptions the corpus is mixed on every pair, and the
-- American form already leads on 12 of 16:
--     behavior   54 / behaviour     7        color      29 / colour      6
--     marginaliz 21 / marginalis    1        center     46 / centre     23
--     organiz    34 / organis      20        recogniz   17 / recognis    7
--     humor       9 / humour        1        characteriz 29 / characteris 43  <- the one exception
-- So the minority rows disagree with both the published default AND with what the
-- corpus mostly already does. `characteris` is the single pair where the British form
-- leads, and it leads because of the ICD-11 clinical family, which this file DEFERS —
-- see below. That pair is deliberately left unresolved rather than half-fixed.
--
-- THE WORD LIST IS NOT A MEASUREMENT, AND THE FIRST ONE PROVED IT. A hand-remembered
-- list of Commonwealth spellings found 40 rows. A structural sweep (-ised/-ising/-isation,
-- -our, -re, doubled-l) found 106 — the first list had missed 62% of its own class,
-- including `uncivilised`, `racialised`, `centred` and `specialising`. A third sweep for
-- the ae/oe and -ine families added 8 more (114), among them `gonorrhoea` on four rows of
-- an HIV/STI glossary. Widen the pattern until it stops finding new FAMILIES, then read.
--
-- WHAT THE REGEX GOT WRONG, which is why nothing here is regex-driven at apply time:
--   * `circumcised` (circumsexual, penis-health-care) and `bruised` (defilement) are
--     correct American English. The -ised pattern cannot tell them apart.
--   * `Haemophilus ducreyi` (chancroid) is a BINOMIAL GENUS NAME, fixed by nomenclature
--     and never Americanized. Repairing it would be a factual error, not a style one.
--   * `glamour` (pin-ups) is the PRIMARY American spelling; `glamor` is the variant.
--   * `color-grey` and `estradiol` deliberately name BOTH spellings as alternates
--     ("Grey or gray is an intermediate color"; "also called oestrogen, oestradiol").
--     The variant spelling is the row's own subject.
-- Each of those is asserted below to SURVIVE.
--
-- MECHANISM. One `replace()` per (slug, token) pair, from an explicit table. `replace()`
-- cannot author prose, so every other byte of every description survives BY CONSTRUCTION
-- rather than by retyping — the same property that made the `vibrant` sweep reviewable.
-- Nothing is inferred at apply time: both the row and the token are named. Re-running
-- applies nothing, because each UPDATE is guarded on the token still being present.
--
-- ACTOR. 55 of the 65 rows are `human_reviewed`, so the declaration is LOAD-BEARING, not
-- attribution — verified live with a REAL value change (a self-assignment changes no
-- column, so the trigger never fires and the probe reads a misleading "allowed"):
--   update ... set description = replace(description,'behaviour','behavior')
--   -> ERROR: human_reviewed tag 933e6243-... cannot be modified by system:trigger
-- The actor names the MIGRATION rather than its version, deliberately: this file has no
-- version string in its body, so a renumber cannot desynchronise a stamp from a
-- postcondition that counts by it.
--
-- WHAT IS DEFERRED, each with the reason it cannot be reached rather than "not got to":
--   * ~35 encyclopedic rows (bali, toronto, madrid, croatia, freedom-of-speech,
--     homophile-movement, sport, slavery, occ-holiday, ...) — the rule's own source-
--     material exception covers them, and editing them means editing someone else's text.
--   * The ICD-11 clinical family (chancroid, gender-incongruence, granuloma-inguinale,
--     orgasmic-dysfunction), all sharing one template: "<category> characterised by
--     <features>, as classified by ICD-11 (<code>)". They cite a WHO source that uses
--     British spelling. Whether a PARAPHRASE inherits its source's orthography is a
--     judgement a `should`-severity rule does not settle, and under-reaching is the
--     correct error.
--   * `pelvic-inflammatory-disease` IS taken, and the split is deliberate: its only hit
--     is `gonorrhoea`, a disease name in our own clause rather than part of the ICD
--     attribution, and leaving it would strand 1 of 4 STI rows on the British form after
--     the other three move. That pair goes to zero corpus-wide; `characteris` does not.
--   * The grey/gray cohort (aromantic-pride-flag, demisexual-pride-flag, silver-fox-chaser,
--     missing-stair) — `grey` names a flag stripe and a set phrase, which is its own
--     decision about community colour naming, not a spelling sweep.
--   * `dependence` (`judgement`) — a widely accepted American variant, not Commonwealth-only.
--   * `event-safety` — reads "Events organised ... organised ... as an organizer", i.e. it
--     carries BOTH spellings in one description. It is imported FetLife boilerplate whose
--     repair is a rewrite, not a spelling fix, so it is left for a pass that can do that.
--
-- NOT claimed: that this changes search. `search_documents_index_tags` indexes
-- `coalesce(t.short_description, t.description, '')` at weight D, so a description
-- reaches the search vector only where `short_description` IS NULL — 24 of these 65.
-- Read the indexer before resting a header on the stronger claim.

do $rewrite$
declare
  rec       record;
  v_hit     int;
  v_rows    int := 0;
  v_pairs   int := 0;
begin
  perform set_config('app.actor', 'migration:tag_description_spelling_standard', true);

  for rec in
    select * from (values
      -- -our -> -or
      ('bear-brotherhood-flag',      'colour',          'color'),
      ('intersex-pride-flag',        'colours',         'colors'),
      ('qpoc',                       'colour',          'color'),
      ('quare-theory',               'colour',          'color'),
      ('reagent-testing',            'colour',          'color'),
      ('queer-resilience',           'humour',          'humor'),
      -- -re -> -er  (no row carries both `centre` and `centred`, so ordering is moot here;
      --              the longer form is still listed first as a standing habit)
      ('cigarette-top',              'centred',         'centered'),
      ('cowification',               'centred',         'centered'),
      ('feedism',                    'centred',         'centered'),
      ('fellatio-slave',             'centred',         'centered'),
      ('food-mommy',                 'centred',         'centered'),
      ('orgasm-play',                'centred',         'centered'),
      ('quare-theory',               'centred',         'centered'),
      ('pep',                        'centres',         'centers'),
      ('queer-of-color-critique',    'centres',         'centers'),
      ('latex-mistress',             'centre',          'center'),
      ('jute',                       'fibre',           'fiber'),
      -- -ise / -isation -> -ize / -ization
      ('clan',                       'organised',       'organized'),
      ('drag-panic',                 'Organised',       'Organized'),
      ('feedism',                    'organised',       'organized'),
      ('genre-poetry',               'organised',       'organized'),
      ('hiv-aids-crisis',            'organised',       'organized'),
      ('hiv-aids-crisis',            'criminalisation', 'criminalization'),
      ('latex-family',               'organised',       'organized'),
      ('muscle-slut',                'organised',       'organized'),
      ('nudist-gathering',           'organised',       'organized'),
      ('sadosexual',                 'organised',       'organized'),
      ('queer-resilience',           'organised',       'organized'),
      ('lesbian-feminism',           'organising',      'organizing'),
      ('crisis-intervention',        'stabilising',     'stabilizing'),
      ('cuntification',              'Feminisation',    'Feminization'),
      ('first-pass-effect',          'metabolising',    'metabolizing'),
      ('gender-affirmation',         'recognised',      'recognized'),
      ('hijra',                      'recognised',      'recognized'),
      ('heteronormativity',          'popularised',     'popularized'),
      ('internalized-oppression',    'marginalised',    'marginalized'),
      ('intimate-partner-violence',  'weaponising',     'weaponizing'),
      ('ketamine',                   'immobilising',    'immobilizing'),
      ('minority-stress',            'stigmatised',     'stigmatized'),
      ('minority-stress',            'internalising',   'internalizing'),
      ('muva',                       'stylised',        'stylized'),
      ('neuroqueer-theory',          'pathologisation', 'pathologization'),
      ('nitrous-oxide',              'pressurised',     'pressurized'),
      ('ownership-kink',             'Eroticising',     'Eroticizing'),
      ('sports-kink',                'Eroticising',     'Eroticizing'),
      ('pet-trainer',                'specialising',    'specializing'),
      ('shock-daddy-shock-mommy',    'specialising',    'specializing'),
      ('qpoc',                       'racialised',      'racialized'),
      ('quare-theory',               'racialised',      'racialized'),
      ('safer-smoking',              'vaporising',      'vaporizing'),
      ('feral-princess-feral-prince','uncivilised',     'uncivilized'),
      -- practise (verb) -> practiced
      ('microdosing',                'practised',       'practiced'),
      ('non-sexual-kink',            'practised',       'practiced'),
      ('power-neutral',              'practised',       'practiced'),
      -- behaviour -> behavior
      ('dogboy',                     'behaviour',       'behavior'),
      ('doggirl',                    'behaviour',       'behavior'),
      ('feral-princess-feral-prince','behaviour',       'behavior'),
      ('kitten-play',                'behaviour',       'behavior'),
      ('pet-trainer',                'behaviour',       'behavior'),
      ('seroadaptation',             'behaviour',       'behavior'),
      ('women-who-have-sex-with-women','behaviour',     'behavior'),
      -- signalling -> signaling
      ('dopamine',                   'signalling',      'signaling'),
      ('gaba',                       'signalling',      'signaling'),
      ('serotonin',                  'signalling',      'signaling'),
      -- medical: ae/oe digraphs and -ine
      ('blowjob',                    'gonorrhoea',      'gonorrhea'),
      ('doxy-pep',                   'gonorrhoea',      'gonorrhea'),
      ('sti-testing',                'gonorrhoea',      'gonorrhea'),
      ('pelvic-inflammatory-disease','gonorrhoea',      'gonorrhea'),
      ('ketamine',                   'anaesthetic',     'anesthetic'),
      ('nitrous-oxide',              'anaesthetic',     'anesthetic'),
      ('pcp',                        'anaesthetic',     'anesthetic'),
      ('cast-fetish',                'orthopaedic',     'orthopedic'),
      ('2c-t-x',                     'sulphur',         'sulfur'),
      -- misc
      ('day-collar',                 'jewellery',       'jewelry'),
      ('ovipositor',                 'modelled',        'modeled'),
      ('ovipositor',                 'gelatine',        'gelatin'),
      ('stealthing',                 'offence',         'offense')
    ) as t(slug, from_s, to_s)
  loop
    v_pairs := v_pairs + 1;

    update unified_tags
       set description = replace(description, rec.from_s, rec.to_s)
     where slug = rec.slug
       and status = 'active'
       and position(rec.from_s in description) > 0;

    get diagnostics v_hit = row_count;
    v_rows := v_rows + v_hit;
  end loop;

  raise notice 'tag_description_spelling_standard: % pairs declared, % applied', v_pairs, v_rows;
end
$rewrite$;

do $verify$
declare
  v_ok  int;
  v_bad int;
begin
  -- 1. REACHED STATE, stated positively. Every declared (slug, token) pair must now be
  --    absent from that row. Counting rows in a BAD state instead would return zero for a
  --    slug that had vanished from the corpus entirely, which is the vacuous form.
  select count(*) into v_ok
  from (values
      ('bear-brotherhood-flag','colour'),('intersex-pride-flag','colours'),
      ('qpoc','colour'),('quare-theory','colour'),('reagent-testing','colour'),
      ('queer-resilience','humour'),('cigarette-top','centred'),('cowification','centred'),
      ('feedism','centred'),('fellatio-slave','centred'),('food-mommy','centred'),
      ('orgasm-play','centred'),('quare-theory','centred'),('pep','centres'),
      ('queer-of-color-critique','centres'),('latex-mistress','centre'),('jute','fibre'),
      ('clan','organised'),('drag-panic','Organised'),('feedism','organised'),
      ('genre-poetry','organised'),('hiv-aids-crisis','organised'),
      ('hiv-aids-crisis','criminalisation'),('latex-family','organised'),
      ('muscle-slut','organised'),('nudist-gathering','organised'),('sadosexual','organised'),
      ('queer-resilience','organised'),('lesbian-feminism','organising'),
      ('crisis-intervention','stabilising'),('cuntification','Feminisation'),
      ('first-pass-effect','metabolising'),('gender-affirmation','recognised'),
      ('hijra','recognised'),('heteronormativity','popularised'),
      ('internalized-oppression','marginalised'),('intimate-partner-violence','weaponising'),
      ('ketamine','immobilising'),('minority-stress','stigmatised'),
      ('minority-stress','internalising'),('muva','stylised'),
      ('neuroqueer-theory','pathologisation'),('nitrous-oxide','pressurised'),
      ('ownership-kink','Eroticising'),('sports-kink','Eroticising'),
      ('pet-trainer','specialising'),('shock-daddy-shock-mommy','specialising'),
      ('qpoc','racialised'),('quare-theory','racialised'),('safer-smoking','vaporising'),
      ('feral-princess-feral-prince','uncivilised'),('microdosing','practised'),
      ('non-sexual-kink','practised'),('power-neutral','practised'),
      ('dogboy','behaviour'),('doggirl','behaviour'),
      ('feral-princess-feral-prince','behaviour'),('kitten-play','behaviour'),
      ('pet-trainer','behaviour'),('seroadaptation','behaviour'),
      ('women-who-have-sex-with-women','behaviour'),('dopamine','signalling'),
      ('gaba','signalling'),('serotonin','signalling'),('blowjob','gonorrhoea'),
      ('doxy-pep','gonorrhoea'),('sti-testing','gonorrhoea'),
      ('pelvic-inflammatory-disease','gonorrhoea'),('ketamine','anaesthetic'),
      ('nitrous-oxide','anaesthetic'),('pcp','anaesthetic'),('cast-fetish','orthopaedic'),
      ('2c-t-x','sulphur'),('day-collar','jewellery'),('ovipositor','modelled'),
      ('ovipositor','gelatine'),('stealthing','offence')
  ) as t(slug, tok)
  join unified_tags u on u.slug = t.slug and u.status = 'active'
  where position(t.tok in u.description) = 0;

  if v_ok <> 77 then
    raise exception 'spelling_standard: only % of 77 declared substitutions reached', v_ok;
  end if;

  -- 2. Every repaired row still carries publishable prose. Call the predicate, never
  --    restate its OR — a hand-rolled "both fields present" form is stricter than the
  --    real gate and would report a correct repair as a defect.
  select count(*) into v_ok
  from unified_tags
  where status = 'active'
    and slug in ('2c-t-x','bear-brotherhood-flag','blowjob','cast-fetish','cigarette-top',
      'clan','cowification','crisis-intervention','cuntification','day-collar','dogboy',
      'doggirl','dopamine','doxy-pep','drag-panic','feedism','fellatio-slave',
      'feral-princess-feral-prince','first-pass-effect','food-mommy','gaba',
      'gender-affirmation','genre-poetry','heteronormativity','hijra','hiv-aids-crisis',
      'internalized-oppression','intersex-pride-flag','intimate-partner-violence','jute',
      'ketamine','kitten-play','latex-family','latex-mistress','lesbian-feminism',
      'microdosing','minority-stress','muscle-slut','muva','neuroqueer-theory',
      'nitrous-oxide','non-sexual-kink','nudist-gathering','orgasm-play','ovipositor',
      'ownership-kink','pcp','pelvic-inflammatory-disease','pep','pet-trainer',
      'power-neutral','qpoc','quare-theory','queer-of-color-critique','queer-resilience',
      'reagent-testing','sadosexual','safer-smoking','seroadaptation','serotonin',
      'shock-daddy-shock-mommy','sports-kink','stealthing','sti-testing',
      'women-who-have-sex-with-women')
    and public.tag_has_prose(description, short_description);

  if v_ok <> 65 then
    raise exception 'spelling_standard: only % of 65 repaired rows carry prose', v_ok;
  end if;

  -- 3. THE ICD-11 CLINICAL FAMILY SURVIVES. Deferred on source attribution, and asserted
  --    so a later pass has to break this file's own check before sweeping it.
  select count(*) into v_ok
  from unified_tags
  where status = 'active'
    and slug in ('chancroid','gender-incongruence','granuloma-inguinale','orgasmic-dysfunction')
    and position('characterised' in description) > 0;

  if v_ok <> 4 then
    raise exception 'spelling_standard: ICD-11 family was swept (% of 4 intact)', v_ok;
  end if;

  -- 4. ENCYCLOPEDIC SOURCE-SPELLING ROWS SURVIVE. The rule's own exception covers them.
  select count(*) into v_ok
  from (values
      ('bali','centre'),('toronto','centre'),('madrid','centre'),
      ('freedom-of-speech','recognised'),('homophile-movement','organisations')
  ) as t(slug, tok)
  join unified_tags u on u.slug = t.slug and u.status = 'active'
  where position(t.tok in u.description) > 0;

  if v_ok <> 5 then
    raise exception 'spelling_standard: encyclopedic controls were swept (% of 5 intact)', v_ok;
  end if;

  -- 5. THE REGEX'S OWN FALSE POSITIVES SURVIVE. `circumcised` and `bruised` are correct
  --    American English; `glamour` is the primary American spelling; `judgement` is an
  --    accepted American variant; `Haemophilus` is a binomial genus name; `color-grey` and
  --    `estradiol` name both spellings as their own subject.
  select count(*) into v_ok
  from (values
      ('pin-ups','glamour'),('dependence','judgement'),('circumsexual','circumcised'),
      ('defilement','bruised'),('chancroid','Haemophilus'),('color-grey','Grey or gray'),
      ('estradiol','oestrogen')
  ) as t(slug, tok)
  join unified_tags u on u.slug = t.slug and u.status = 'active'
  where position(t.tok in u.description) > 0;

  if v_ok <> 7 then
    raise exception 'spelling_standard: false-positive controls were swept (% of 7 intact)', v_ok;
  end if;

  -- 6. THE GREY/GRAY COHORT SURVIVES — its own decision, not this file's.
  select count(*) into v_ok
  from unified_tags
  where status = 'active'
    and slug in ('aromantic-pride-flag','demisexual-pride-flag','silver-fox-chaser')
    and position('grey' in description) > 0;

  if v_ok <> 3 then
    raise exception 'spelling_standard: grey cohort was swept (% of 3 intact)', v_ok;
  end if;

  -- 7. `gonorrhoea` goes to ZERO corpus-wide. Unlike `characteris`, this pair is fully
  --    resolved, which is why it is the one asserted as a corpus-wide invariant.
  select count(*) into v_bad
  from unified_tags
  where status = 'active' and description is not null
    and description ~* '\mgonorrhoea\M';

  if v_bad <> 0 then
    raise exception 'spelling_standard: % active descriptions still spell gonorrhoea', v_bad;
  end if;

  -- 8. `event-safety` still carries BOTH spellings — deferred as imported boilerplate
  --    whose repair is a rewrite. Asserted so the deferral is visible rather than assumed.
  select count(*) into v_ok
  from unified_tags
  where status = 'active' and slug = 'event-safety'
    and position('organised' in description) > 0
    and position('organizer' in description) > 0;

  if v_ok <> 1 then
    raise exception 'spelling_standard: event-safety deferral no longer holds';
  end if;

  raise notice 'tag_description_spelling_standard: all 8 postconditions passed';
end
$verify$;
