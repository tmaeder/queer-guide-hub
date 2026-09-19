-- Glossary descriptions, batch 11 residue: the EMBEDDED Commonwealth spellings.
--
-- WHAT THIS FIXES, AND HOW IT WAS MISSED
--
-- Batch 11 (99990101100000_tag_description_spelling_standard) took 65 rows / 77
-- substitutions on the spelling axis. Verifying it after merge found two rows it
-- should have taken and did not:
--
--   spiking  'colourless' + 'millilitres'
--   ghb      'millilitres'
--
-- The cause is a word-boundary bug in that pass's candidate sweep. It matched the
-- Commonwealth token as a WHOLE WORD -- colour, colours, centre, centres, litre --
-- so every form where the token is EMBEDDED slipped through:
--
--   colour + less   -> colourless
--   milli + litres  -> millilitres
--
-- Batch 11's own header congratulates itself for widening a hand-remembered word
-- list (40 rows) into a structural sweep (106, then 114), on the rule "widen the
-- pattern until it stops finding new FAMILIES, then read". It widened for new
-- families and never for EMBEDDING. Same error, one level down.
--
-- WHY THESE TWO ARE OURS TO TAKE (and the ~35 encyclopedic rows are not)
--
-- styleguide_rules.spelling-and-units, severity `should`:
--   "Follow the source material's spelling; otherwise American."
--
-- Both rows are prose THIS SERIES AUTHORED, not text copied from a source. The
-- Berlin harm-reduction pass (50100101100000) filled spiking's empty body from the
-- MANEO handout; ghb's body is platform voice. Neither carries an attribution
-- clause, so the source-material exception does not reach them.
--
-- That line is drawn by batch 11's OWN precedent, not invented here. It deferred
-- the ICD-11 family ("<category> characterised by <features>, as classified by
-- ICD-11 (<code>)") because the orthography sits inside an attribution frame, and
-- in the same breath it TOOK pelvic-inflammatory-disease, whose only hit is
-- `gonorrhoea` -- "a disease name in our own clause rather than part of the ICD
-- attribution". spiking and ghb are entirely our own clauses.
--
-- MECHANISM -- unchanged from batch 11
--
-- One replace() per (slug, token) pair from an explicit table, guarded on the token
-- still being present so a re-run is inert. replace() CANNOT author prose, so every
-- other byte survives by construction rather than by retyping.
--
-- The actor names the MIGRATION, not its version: this file carries no version
-- string in its body, so a renumber cannot desynchronise a stamp from a
-- postcondition that counts by it.
--
-- ACTOR DECLARATION IS LOAD-BEARING HERE. Both rows are human_reviewed = true, and
-- log_unified_tag_change() RAISEs when an undeclared (system:%) actor modifies such
-- a row. Verified with a REAL value change, not a self-assignment -- a self-assign
-- changes no column, so a trigger gating on a change never fires and the probe
-- reads a misleading "allowed".
--
-- WHAT IS DELIBERATELY NOT TAKEN
--
-- The widened sweep returned 30 rows corpus-wide. 28 are refused, in four classes,
-- each asserted to SURVIVE below so a later pass cannot quietly sweep them:
--
--   1. ENCYCLOPEDIC (Wikipedia-derived leads) -- the source-material exception.
--      croatia/madrid/wales 'kilometres', stolperstein 'centimetre',
--      airport 'centres', paignton 'harbour', toronto 'harbour',
--      slavery 'labour', tea 'flavour', color-rainbow 'multicoloured'.
--
--   2. COMMUNITY IDENTITY VOCABULARY -- 'greysexual' / 'greysexuality' /
--      'greygender' are spellings of an IDENTITY TERM, not a colour word.
--      styleguide_rules community-words-in-their-real-sense protects exactly this.
--
--   3. NAMES BOTH SPELLINGS AS ITS OWN SUBJECT -- community-center opens
--      "A community centre, community center, or community hall"; graygender says
--      "(also spelled greygender)". The colour-grey / estradiol class of batch 11.
--
--   4. FALSE POSITIVES OF THE WIDENED SWEEP ITSELF -- fembot and robot matched on
--      'programmed', because the pattern `programme` is a prefix of it. That is the
--      boundary error in the OPPOSITE direction: widening created noise where
--      narrowing had created misses. "programmed" is correct American English.
--
--   Plus grizzly-bear 'greying', which IS a colour word in our own voice but sits
--   in the grey/gray cohort batch 11 deferred as its own decision.
--
-- Guarded by src/lib/__tests__/tagProseSpellingEmbedded.test.ts.

do $rewrite$
declare
  rec   record;
  v_hit int;
  v_rows  int := 0;
  v_pairs int := 0;
begin
  perform set_config('app.actor', 'migration:tag_description_spelling_embedded', true);

  for rec in
    select * from (values
        -- -our embedded before a suffix
        ('spiking', 'colourless',  'colorless'),
        -- -re embedded after a metric prefix
        ('spiking', 'millilitres', 'milliliters'),
        ('ghb',     'millilitres', 'milliliters')
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

  raise notice 'tag_description_spelling_embedded: % pairs applied, % row-updates', v_pairs, v_rows;
end
$rewrite$;

do $verify$
declare
  v_bad int;
begin
  -- 1. Every pair reached: the old spelling is gone and the new one is present.
  --    Counted POSITIVELY (= 3), because counting rows in a BAD state returns
  --    zero for a slug that has gone missing from the corpus entirely.
  select count(*) into v_bad
  from (values
      ('spiking', 'colourless',  'colorless'),
      ('spiking', 'millilitres', 'milliliters'),
      ('ghb',     'millilitres', 'milliliters')
    ) as p(slug, from_s, to_s)
  join unified_tags t on t.slug = p.slug and t.status = 'active'
  where position(p.from_s in t.description) = 0
    and position(p.to_s   in t.description) > 0;

  if v_bad <> 3 then
    raise exception 'tag_description_spelling_embedded: expected 3 applied pairs, found %', v_bad;
  end if;

  -- 2. Both rows still publishable. Calls the real predicate rather than
  --    restating it -- tag_has_prose is an OR, and a hand-rolled "both present"
  --    form is a different and stricter check.
  select count(*) into v_bad
  from unified_tags
  where slug in ('spiking', 'ghb')
    and status = 'active'
    and not public.tag_has_prose(description, short_description);

  if v_bad <> 0 then
    raise exception 'tag_description_spelling_embedded: % row(s) lost publishable prose', v_bad;
  end if;

  -- 3. Nothing else in either description changed. replace() guarantees this by
  --    construction, so this asserts the SURVIVING content explicitly: a check
  --    that only confirmed the token is gone passes equally against a rewrite.
  select count(*) into v_bad
  from unified_tags
  where status = 'active'
    and (
      (slug = 'spiking' and (
            position('Putting a drug into someone''s drink, or into shared lube, without them knowing' in description) = 0
         or position('Harm-reduction guidance treats it as an assault in progress' in description) = 0
         or position('your own cup, marked; your own lube; your own bottle' in description) = 0))
      or
      (slug = 'ghb' and (
            position('A liquid depressant used both in nightlife and in chemsex' in description) = 0
         or position('a volume of GBL matching an ordinary GHB dose can be fatal' in description) = 0))
    );

  if v_bad <> 0 then
    raise exception 'tag_description_spelling_embedded: surrounding prose was altered on % row(s)', v_bad;
  end if;

  -- 4. The ENCYCLOPEDIC cohort survives (source-material exception).
  select count(*) into v_bad
  from (values
      ('croatia',       'kilometres'),
      ('madrid',        'kilometres'),
      ('wales',         'kilometres'),
      ('stolperstein',  'centimetre'),
      ('airport',       'centres'),
      ('paignton',      'harbour'),
      ('toronto',       'harbour'),
      ('slavery',       'labour'),
      ('tea',           'flavour'),
      ('color-rainbow', 'multicoloured')
    ) as s(slug, needle)
  join unified_tags t on t.slug = s.slug and t.status = 'active'
  where position(s.needle in t.description) = 0;

  if v_bad <> 0 then
    raise exception 'tag_description_spelling_embedded: % encyclopedic control(s) were swept', v_bad;
  end if;

  -- 5. Community identity vocabulary, both-spellings-as-subject, and the
  --    'programmed' false positives all survive.
  select count(*) into v_bad
  from (values
      ('acespec',            'greysexual'),
      ('asexual-pride-flag', 'greysexuality'),
      ('graygender',         'greygender'),
      ('community-center',   'centre'),
      ('fembot',             'programmed'),
      ('robot',              'programmed'),
      ('grizzly-bear',       'greying')
    ) as s(slug, needle)
  join unified_tags t on t.slug = s.slug and t.status = 'active'
  where position(s.needle in t.description) = 0;

  if v_bad <> 0 then
    raise exception 'tag_description_spelling_embedded: % refusal control(s) were swept', v_bad;
  end if;

  -- 6. Corpus-wide: this pair goes to zero, the way batch 11 drove gonorrhoea to
  --    zero. 'millilitre' is a metric unit with no source-material defence
  --    anywhere in our own voice.
  select count(*) into v_bad
  from unified_tags
  where status = 'active'
    and description is not null
    and position('millilitre' in description) > 0;

  if v_bad <> 0 then
    raise exception 'tag_description_spelling_embedded: millilitre still present on % active row(s)', v_bad;
  end if;

  raise notice 'tag_description_spelling_embedded: all 6 postconditions passed';
end
$verify$;
