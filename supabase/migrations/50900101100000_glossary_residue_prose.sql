-- Glossary residue: the five rows the HIV/STI and terminology passes named as
-- open and did not fix, closed here.
--
-- Each was recorded rather than silently dropped, and each needed a different
-- answer. Re-measured on prod immediately before writing this file, because two
-- other items on that same list (the 195-row category junction gap, the
-- wrong-subject prose cohort) were closed by 50700101100000 and 50700101100200
-- while this list sat — a recorded open item is not still open just because it
-- was once written down.
--
-- 1. `sti-testing` — BOTH prose fields defective, in DIFFERENT ways.
--
--    `description` is a definition of **STI**, not of STI testing: "A sexually
--    transmitted infection (STI), also referred to as a sexually transmitted
--    disease (STD) and the older term venereal disease (VD), is an infection
--    that is spread by sexual activity...". That is the wrong-SENSE class —
--    the same shape as `/tags/aids` opening with the definition of HIV
--    (50400101100400), and `sti` is a separate live row with 95 uses that
--    already carries this exact content. The corpus stated STI twice and the
--    testing page said nothing about testing.
--
--    `long_description` has the right subject but two defects of its own: it
--    cites its own source to the reader ("According to a scientific article
--    published on August 21, 2013") and pads with "It is recommended to consult
--    a healthcare provider". Citing the source to the reader is exactly why the
--    HIV/STI pass left this row deprecated rather than reviving it. Something
--    has revived it since — it is ACTIVE now — so the prose is reachable and
--    the deferral no longer holds.
--
--    REPLACED, not retracted, because the row is live: the `darkroom` rule. The
--    prior text survives in `tag_change_log.before_data`, which is why content
--    writes declare an actor.
--
--    `human_reviewed := true` is set deliberately and honestly — this row IS
--    being reviewed here. It is also load-bearing: `deprecate_unused_tags()`
--    selects exactly `status='active' AND human_reviewed=false AND
--    usage_count=0`, which this row matches today, so writing good prose
--    without it queues the page for deletion. It does NOT publish anything:
--    `seo_indexable` stays false and is not touched.
--
-- 2/3. `cialis` and `levitra` — active, indexable, no body.
--
--    Both are BRAND rows whose generic counterpart carries the full body
--    (`tadalafil` 965 chars, `vardenafil` 801). Merging brand into generic was
--    considered and REJECTED: `viagra` already exists as a separate brand row
--    with its own body, so brand-as-its-own-row is the established shape here,
--    and merging would change a pattern rather than fill a hole.
--
--    So each body carries what the BRAND page adds over the generic, not a
--    paraphrase of it. For Cialis that is once-daily dosing, which inverts the
--    safety advice the generic page gives: the 48-hour nitrate interval is
--    reachable by waiting only if dosing is on-demand. For Levitra it is the
--    orodispersible form and the fact that its label determines no safe
--    interval at all, so "wait long enough" is not an option that exists.
--
-- 4. `priapism` — active, indexable, no body, and the highest-stakes of the
--    five. Its `description` already carries the action ("Past two hours it is
--    a hospital matter"). The body carries the mechanism, because the reason
--    the home remedies people reach for do not work is that the problem is
--    vascular, not arousal. The four-hour clinical definition is stated and
--    does NOT contradict the row's own two-hour threshold — it is the reason
--    for it: four hours is when damage is already accruing, so two hours is
--    when to start moving. Written to agree with the row it sits under rather
--    than to restate a guideline over the top of it.
--
-- 5. `chill` — an empty `Venue Types` stub that the Berlin harm-reduction pass
--    (50100101100100) recorded as blocking the chemsex sense of "Chill" from
--    being aliased onto `chemsex`, since `tag_reject_alias_shadow()` refuses an
--    alias whose slug is held by a tag NAME.
--
--    ITS ONE ASSIGNMENT IS A VENUE (`unified_tag_assignments` → `venues`), so
--    the venue sense is the one in live use and the stub is filled as a venue
--    type. THE CHEMSEX SENSE REMAINS UNALIASABLE and that is recorded here
--    rather than worked around: it is not a real gap in the vocabulary, because
--    `chemsex` already carries `Chems` (covers, approved), `Party & Play`,
--    `PnP` and `Chem-Sex`. Deprecating a tag that is in use to free a slug for
--    an alias is a trade this file declines to make.
--
-- ONE UPDATE PER SLUG, NEVER A SET-BASED STATEMENT. `sync_tag_category_assignment`
-- (BEFORE UPDATE) and its AFTER sibling mean a statement touching one tuple
-- twice raises 27000 "tuple already modified" — established by 20260907100000
-- and restated by 20261002100200.
--
-- ACTOR. `log_unified_tag_change()` RAISEs when a `system:%` actor modifies a
-- `human_reviewed = true` row, and cialis / levitra / priapism are all
-- human_reviewed. Without the declared actor this migration cannot write them.
--
-- Every write is CONTENT-GUARDED on the defect it repairs, so a human who fixes
-- one of these first keeps their work and this file no-ops on that row.

select set_config('app.actor', 'migration:50900101100000_glossary_residue_prose', true);

-- ── 1. sti-testing: description describes STI, not STI testing ───────────────
update public.unified_tags set
  description = 'Screening for sexually transmitted infections in someone who has no symptoms, which is how most STIs are found: chlamydia, gonorrhoea and early syphilis are frequently silent, and HIV can be for years. What a test covers is not standard — a clinic asks about the sex you actually have, because a throat and rectal swab find infections a urine sample alone will miss.',
  long_description = 'Testing is scheduled rather than triggered. Most sexually transmitted infections cause nothing a person would notice, so waiting for a symptom means waiting for a complication — untreated chlamydia or gonorrhoea becoming pelvic inflammatory disease, syphilis moving through its stages, HIV found late.

What gets tested matters more than how often. An infection lives where the exposure happened, so a urine sample or a blood draw alone misses pharyngeal and rectal infection entirely; for anyone having oral or anal sex, three-site swabbing is what makes the result mean anything. Ask what was sampled, not just what was ordered.

Timing is the other half. Every test has a window period — the interval after exposure during which an infection is present but not yet detectable — so a negative result taken too early describes the past, not the present. A fourth-generation HIV test typically detects infection around four weeks, syphilis serology can take longer, and a test taken the morning after an exposure answers a question about the weeks before it.

Testing is also the entry point to everything else: a positive result is treatable, and a negative one is where PrEP, vaccination against hepatitis A and B and HPV, and partner notification are discussed.',
  human_reviewed = true
where slug = 'sti-testing'
  and description ilike '%also referred to as a sexually transmitted disease%';

-- ── 2. cialis: brand row, empty body ─────────────────────────────────────────
update public.unified_tags set
  long_description = 'Cialis is the brand name tadalafil was first sold under; generic tadalafil is the same drug and the same rules apply to both.

The brand-specific detail that matters is dosing. Cialis is licensed in two quite different schedules — on demand before sex, and a low dose taken every day. That changes the nitrite advice completely. The label requires at least 48 hours between a dose and any nitrate, and someone on the daily schedule is never outside that window: there is no interval to wait out, so poppers are simply not available to them while they stay on it. The 36 hours the brand is known for is the longest interval at which it outperformed placebo, not a point at which the drug has gone.

Tadalafil is also licensed for benign prostatic hyperplasia, so a person can be taking Cialis daily for their prostate and not think of themselves as taking an erection drug at all. The contraindication does not care what it was prescribed for.'
where slug = 'cialis'
  and coalesce(long_description, '') = '';

-- ── 3. levitra: brand row, empty body ────────────────────────────────────────
update public.unified_tags set
  long_description = 'Levitra is the brand name vardenafil was sold under. The generic is the same drug.

Its label is the strictest of the class on nitrites, and the strictness is easy to miss because it reads as an absence: where tadalafil names a 48-hour interval, vardenafil states that no safe interval between a dose and a nitrate has been determined. That is not a shorter wait, it is the absence of one. There is no number to count down, so the only answer the label supports is not combining them.

Vardenafil is also sold in an orodispersible form that dissolves on the tongue, marketed as Staxyn. It is the same drug, but the two are not interchangeable milligram for milligram, so a dose is not transferable between the formulations.

The original Levitra label predates the current format and never mentions riociguat; the class contraindication with guanylate cyclase stimulators still applies, and its absence there is an artefact of the document''s age rather than a safety difference.'
where slug = 'levitra'
  and coalesce(long_description, '') = '';

-- ── 4. priapism: active, indexable, no body ──────────────────────────────────
update public.unified_tags set
  long_description = 'Clinically, priapism is an erection lasting beyond four hours that is not driven by arousal and does not resolve with it. That four-hour mark is not a deadline to aim for — it is the point at which tissue damage is already accruing, which is why the advice here is to start moving at two.

There are two kinds and they are not equally urgent. The common and dangerous one is ischemic, or low-flow: blood enters the erectile tissue and cannot leave. Trapped blood stops carrying oxygen within hours, the tissue becomes acidic, the smooth muscle begins to die, and what replaces it is scar. That is the mechanism behind permanent erectile dysfunction after a single episode, and it is also why it hurts — a rigid, painful erection is the presentation that needs a hospital. The rarer non-ischemic kind follows a blunt injury to the perineum or genitals, is usually not painful and not fully rigid, and is not the same emergency.

Nothing done at home addresses it, because the problem is mechanical rather than sexual. Orgasm does not drain trapped blood, ice constricts the vessels that would carry it away, and alcohol only delays leaving. Treatment is a procedure: blood is drawn off the erectile bodies with a needle, often with irrigation, usually with an injection of phenylephrine to constrict the tissue, and a surgical shunt if that fails. Done early these usually work; done late they are managing damage.

Risk is raised by erection drugs, and much more so by the injected ones used when tablets stop working. Stimulants and long sessions compound it, which is why it turns up in chemsex contexts where PDE5 inhibitors are stacked with chems over many hours. Sickle cell disease and sickle cell trait carry a high independent risk, as do some antidepressants and antipsychotics — trazodone most notably. Anyone in those groups should treat a long erection as urgent sooner rather than later.'
where slug = 'priapism'
  and coalesce(long_description, '') = '';

-- ── 5. chill: empty Venue Types stub, one live venue assignment ──────────────
update public.unified_tags set
  description = 'A quieter room or area in a club or party venue, away from the dancefloor and the sound system, for sitting down and talking.',
  long_description = 'In a venue listing, a chill-out room is the low-stimulation space a night is built around rather than an afterthought: somewhere to cool down, hear a conversation, drink water and sit with someone. Larger clubs run one as a matter of course, and its presence is a reasonable signal about how a place expects people to pace a long night.

Note the word carries an unrelated meaning in harm-reduction contexts, where a chill is a private sexualised session involving drugs. That sense belongs to chemsex and is not what this venue tag marks.'
where slug = 'chill'
  and coalesce(description, '') = ''
  and coalesce(long_description, '') = '';

-- ── Postcondition ───────────────────────────────────────────────────────────
-- Counted POSITIVELY: the number of rows in the state this file exists to
-- REACH. Counting rows still in the bad state passes vacuously for a slug that
-- has gone missing from the corpus, which is the trap 50300101100000 recorded.
DO $verify$
DECLARE
  v_bodied   int;
  v_sti_desc int;
  v_sti_long int;
  v_leaks    int;
BEGIN
  -- The four rows that needed a body now have one.
  SELECT count(*) INTO v_bodied FROM public.unified_tags
   WHERE slug IN ('cialis','levitra','priapism','chill')
     AND length(coalesce(long_description,'')) > 200;
  IF v_bodied <> 4 THEN
    RAISE EXCEPTION 'expected 4 bodied rows (cialis, levitra, priapism, chill); found %', v_bodied;
  END IF;

  -- sti-testing now describes TESTING in both fields, and no longer defines STI.
  SELECT count(*) INTO v_sti_desc FROM public.unified_tags
   WHERE slug = 'sti-testing'
     AND description NOT ILIKE '%also referred to as a sexually transmitted disease%'
     AND description ILIKE '%screening%';
  IF v_sti_desc <> 1 THEN
    RAISE EXCEPTION 'sti-testing description still describes STI rather than STI testing';
  END IF;

  SELECT count(*) INTO v_sti_long FROM public.unified_tags
   WHERE slug = 'sti-testing'
     AND long_description NOT ILIKE '%According to a scientific article%'
     AND long_description NOT ILIKE '%consult a healthcare provider%'
     AND long_description ILIKE '%window period%';
  IF v_sti_long <> 1 THEN
    RAISE EXCEPTION 'sti-testing long_description still cites its own source or pads with boilerplate';
  END IF;

  -- Nothing written here may publish. None of the five is newly indexable, and
  -- the prose must not carry the v1.3.0 avoid phrase it would be ironic to add.
  SELECT count(*) INTO v_leaks FROM public.unified_tags
   WHERE slug IN ('sti-testing','cialis','levitra','priapism','chill')
     AND (coalesce(long_description,'') ILIKE '%sexually transmitted disease%'
       OR coalesce(description,'')      ILIKE '%safe sex%');
  IF v_leaks <> 0 THEN
    RAISE EXCEPTION 'prose written here carries a styleguide avoid phrase on % row(s)', v_leaks;
  END IF;

  -- A literal backslash-n renders as an escape sequence to the reader; the
  -- corpus convention is real newlines inside the quoted string (20261007120000).
  -- NOTE `LIKE '%\n%'` is WRONG here and this guard first shipped that way: in a
  -- LIKE pattern the backslash is the ESCAPE character, so that pattern means
  -- "contains the letter n" and fired on all five rows. `position()` does no
  -- pattern interpretation, so it tests what it says it tests.
  SELECT count(*) INTO v_leaks FROM public.unified_tags
   WHERE slug IN ('sti-testing','cialis','levitra','priapism','chill')
     AND (position('\n' in coalesce(long_description,'')) > 0
       OR position('\n' in coalesce(description,''))      > 0);
  IF v_leaks <> 0 THEN
    RAISE EXCEPTION 'literal backslash-n found in prose on % row(s)', v_leaks;
  END IF;

  RAISE NOTICE 'glossary residue prose: 4 bodies filled, sti-testing repaired on both fields';
END
$verify$;
