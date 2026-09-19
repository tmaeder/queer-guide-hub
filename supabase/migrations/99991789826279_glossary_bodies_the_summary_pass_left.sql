-- Five bodies the summary repairs left standing — and the e2e is what found them.
--
-- THIRD FOLLOW-UP TO #3807, AND THE SECOND TIME THE SAME SHAPE HAS SURFACED.
-- #3807 replaced two namesake SUMMARIES (`praise-kink` said "is a term from a
-- podcast episode", `primal-play` said "is a form of self-expression") and left
-- their long_description alone, because its working rule was that a row's
-- description is the evidence and only the summary gets rewritten. That is the
-- half-repaired class this repo already records on `collar` (careful kink
-- description and body, "Family name or surname" still on the lead line) and
-- on the reverse shape in #3810.
--
-- FOUND BY THE PROD E2E, NOT BY A TEST OR A QUERY. The new spec falls back to
-- the SPA for deindexed rows — the 46 revived and 55 created rows are all
-- seo_indexable=false, so crawler HTML renders no <article> for them and a
-- crawler-only spec skips 13 of 19 cases and passes without testing anything.
-- Reading the rendered page is what showed a corrected summary sitting on top
-- of an uncorrected body.
--
-- Widening from those two to the shape they share — a body that cites its own
-- absent sources, or names a podcast as the term's origin — returns FIVE active
-- rows. The regex narrows what a human reads; all five were read in full, and
-- each one's `description` is CORRECT, which is what makes the body the only
-- thing to fix:
--
--   ball-kicking  (Fetishes, adult) description is accurate CBT prose, while
--                 the summary reads "Physical activity with a ball" and the
--                 body is about SOCCER. A wrong SUBJECT, the trampling/darkroom
--                 class, missed by #3807 because its summary contains no
--                 namesake signature — it just describes a different thing.
--   minsexual     INDEXABLE. Body: "As there are no provided sources,
--                 information on this term is limited. It is essential to
--                 approach this topic with sensitivity" — refusal prose plus
--                 the advice register TAG_STYLE_SYSTEM bans.
--   neosexual     INDEXABLE. Same two faults, plus "it's crucial to prioritize".
--   praise-kink   Body names a podcast episode as the term's origin AND
--                 misdefines it — "expressing appreciation for someone's kinks"
--                 is not what a praise kink is; the row's own description has
--                 it right.
--   primal-play   Body says nothing the description does not, and closes on the
--                 same refusal clause.
--
-- WHY tag_hygiene_stats().refusal_prose_active DOES NOT CATCH THESE, and why
-- this file does not widen it: that zero-invariant matches the "No information
-- available" STAMP, the shape 20261012090000 nulled 175 of. These five are
-- prose that argues itself into a refusal mid-paragraph, which is a different
-- string every time — "As there are no provided sources", "No specific
-- information is available on this topic beyond general physical activity".
-- A regex broad enough to catch that phrasing is broad enough to catch honest
-- prose that says a term is contested, which this corpus deliberately keeps
-- (`morosexual` and `novosexual` both carry "not an officially recognized term
-- in the scientific community" and are correct). Widening the invariant is a
-- decision about a detector, not a repair, and belongs in its own change.
--
-- TREATMENT. Bodies are NULLED, not rewritten: every one of the five has a
-- correct `description` and a usable `short_description`, so nulling removes a
-- wrong claim without thinning the page below what it can publish. Asserted
-- rather than assumed — enforce_tag_thin_page_gate reads
-- tag_has_prose(description, short_description) only, and all five keep both.
-- Minting replacement bodies would be the LLM rewrite both auto-apply paths
-- were retired for. `long_description` is also absent from
-- trg_search_documents_tag's column list, so this causes no search churn.
--
-- `ball-kicking` additionally gets its SUMMARY replaced, because "Physical
-- activity with a ball" is a different subject rather than a thin one, and it
-- is the lead line and the search-facet text. The replacement restates that
-- row's own description and chooses no sense.
--
-- Guarded by src/lib/__tests__/glossaryBodiesLeftBehind.test.ts and by
-- e2e/tags-sex-glossary-pass.spec.ts, which reads the surface these rows
-- actually render on.

begin;

select set_config('app.actor', 'migration:99991789826279_glossary_bodies_the_summary_pass_left', true);

-- ball-kicking: the summary is a different subject, not a thin one.
update unified_tags set
  short_description = 'Kicks to the testicles as consensual BDSM play.'
where slug = 'ball-kicking' and short_description ilike '%Physical activity with a ball%';

-- The five bodies. Each is content-guarded on the exact defect it removes, so a
-- concurrent repair no-ops instead of being clobbered.
update unified_tags set long_description = null
where slug = 'ball-kicking' and long_description ilike '%kicking a ball%';

update unified_tags set long_description = null
where slug = 'minsexual' and long_description ilike '%As there are no provided sources%';

update unified_tags set long_description = null
where slug = 'neosexual' and long_description ilike '%As there are no provided sources%';

update unified_tags set long_description = null
where slug = 'praise-kink' and long_description ilike '%discussed in an episode of%';

update unified_tags set long_description = null
where slug = 'primal-play' and long_description ilike '%As there are no provided sources%';

-- ============================ postconditions ============================
do $verify$
declare v_bad int; v_n int;
begin
  -- 1. the reached state, counted positively: all five still publish, and none
  --    of them still carries a body. Counting rows in a BAD state returns 0 for
  --    a slug that has gone missing from the corpus, which is the vacuous form.
  select count(*) into v_n from unified_tags
  where slug in ('ball-kicking','minsexual','neosexual','praise-kink','primal-play')
    and status = 'active'
    and long_description is null
    and tag_has_prose(description, short_description);
  if v_n <> 5 then
    raise exception 'expected 5 rows body-cleared and still publishable, found %', v_n;
  end if;

  -- 2. no active row anywhere still publishes a body that refuses itself or
  --    cites a podcast as a term's origin
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and (long_description ~* 'as there are no provided sources'
      or long_description ~* 'discussed in an episode of'
      or long_description ~* 'No specific information is available on this topic');
  if v_bad <> 0 then raise exception '% active rows still publish a self-refusing body', v_bad; end if;

  -- 3. ball-kicking is no longer about sport, on EITHER field
  select count(*) into v_bad from unified_tags
  where slug = 'ball-kicking'
    and (coalesce(short_description,'') ilike '%Physical activity with a ball%'
      or coalesce(long_description,'') ilike '%soccer%');
  if v_bad <> 0 then raise exception 'ball-kicking still publishes the sport sense'; end if;

  -- 4. CONTROLS. Nulling a body is the mirror of leaving a wrong one, so rows
  --    whose bodies are honest about a term being contested must SURVIVE — a
  --    sweep broad enough to take them would satisfy check 2 as well.
  select count(*) into v_bad from unified_tags
  where slug in ('morosexual','novosexual')
    and coalesce(long_description,'') !~* 'not an officially recognized term';
  if v_bad <> 0 then
    raise exception '% rows that honestly flag a contested term were swept', v_bad;
  end if;

  -- 5. nothing here touched the description — it is the evidence that justified
  --    each repair, and all five must still carry one
  select count(*) into v_bad from unified_tags
  where slug in ('ball-kicking','minsexual','neosexual','praise-kink','primal-play')
    and coalesce(btrim(description),'') = '';
  if v_bad <> 0 then raise exception '% repaired rows lost their description', v_bad; end if;
end
$verify$;

commit;
