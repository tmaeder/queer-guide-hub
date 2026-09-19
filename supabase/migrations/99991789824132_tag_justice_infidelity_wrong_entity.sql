-- Round eighteen, sibling — TWO WRONG ENTITIES THE CLASS GATE CANNOT REACH.
--
-- The gate in 99991789821608 refuses an entity whose CLASS is not clinical. It
-- is silent about an entity that is simply the WRONG ONE, and re-reading all
-- 135 code-bearing identifiers found two. Both were resolved live against
-- wbgetentities before this file was written, never inferred from the tag name:
--
--   justice     Q16533  = JUDGE        wikipedia_url .../wiki/Judge
--   infidelity  Q157833 = EMBEZZLEMENT wikipedia_url .../wiki/Embezzlement
--
-- Both are ACTIVE and `seo_indexable`, and on both the row ARGUES WITH ITSELF —
-- the `description` is correct and everything derived from the identifier is
-- about something else:
--
--   /tags/justice     (Politics & Activism, usage 75)
--     description        "The principle that people should be treated fairly
--                         and given what they are due."
--     short_description  "Official presiding over court proceedings"
--     long_description   a definition of a judge
--
--   /tags/infidelity  (Relationship Structures, usage 13)
--     description        "A kink involving the fantasy or consensual enactment
--                         of unfaithfulness within a relationship..."
--     short_description  "Theft of entrusted assets"
--     long_description   "Infidelity, ALSO KNOWN AS EMBEZZLEMENT, refers to the
--                         theft of assets from one person or entity by another
--                         to whom the assets were entrusted..."
--
-- The second is the sharper one: the body does not merely describe the wrong
-- thing, it ASSERTS THE IDENTITY — "Infidelity, also known as embezzlement" —
-- so a reader of a kink glossary is told the two words are synonyms.
--
-- WHY NEITHER EXISTING GUARD CATCHES THEM. `tag-wiki-guard.ts` requires the
-- resolved title to agree with the tag name and the class to be plausible;
-- "Judge" and "Embezzlement" agree with nothing, so the guard would refuse
-- them — but it seals the PRODUCER, and this prose was written in the
-- 2026-04-27 sweep that predates it. The 2026-08-29 repair classified by P31
-- and deliberately left the CONCEPT class alone, and both of these are ordinary
-- concepts. And `tag_disowned_prose_signals()` keys on
-- `tag_wikidata_repair_audit`, which holds no row for either.
--
-- THE CLASS GATE CATCHES ONE OF THEM, FOR THE WRONG REASON. Q16533 `judge` is
-- classed `legal profession` / `legal position` / `occupation group (ISCO-08)`,
-- so the sibling migration already reaps its SNOMED code as an occupation.
-- Q157833 `embezzlement` is classed `crime`, which that vocabulary deliberately
-- does NOT carry (an abuse concept can legitimately hold an ICD code), so its
-- code survives the gate and is removed here instead — by nulling the
-- identifier, which is the correct mechanism for a wrong entity anyway.
--
-- NO REPOINT. Neither identifier is replaced with a guess. `city_qid_gap_link`,
-- `tag_medical_codes_sync` and `tag_wikidata_hierarchy` all rebuild from the
-- identifier weekly, so a plausible-but-wrong QID regenerates wrong data
-- forever while a null one regenerates nothing — the rule this file's own
-- Kowloon entry records, and the reason `Q216651` was resolved live there
-- rather than recalled (it turned out to be a family of microcontrollers).
--
-- THE CODES NEED NO STATEMENT HERE. Round seventeen's reaper is the exact
-- complement of the sync's work set, so nulling an identifier makes that tag's
-- codes orphans and the reaper removes them. It is called once at the end,
-- which is also the proof the two rounds compose.
--
-- NOTHING IS WRITTEN TO `tag_wikidata_repair_audit`, deliberately — it is the
-- INPUT to `tag_disowned_prose_signals()`, so a row there would make these tags
-- "repaired" and their prose-at-repair-time the baseline that sentinel compares
-- against, perturbing a live metric to record what this file already records.
-- The prior values survive in `tag_change_log.before_data`, which is why
-- content writes go through an attributed actor. (Round twelve's rule, applied
-- to the same table for the same reason.)
--
-- PROSE REPLACED, NOT RETRACTED, for the summary; the BODY is nulled. Both rows
-- are active and rendering, so nulling the summary would leave a live page
-- thinner instead of correct (the `darkroom`/`methadone` rule). The body is a
-- different case: each row's `description` is a single line — enough to state
-- what the tag is, not enough to write a body from — and minting one is the
-- guess this whole class came from, so it goes (the `doe`/`fae`/`bunny`
-- treatment). Nulling is safe and ASSERTED rather than assumed below by CALLING
-- `tag_has_prose`, which is an OR over description and short_description, not
-- the stricter both-present form.
--
-- The replacement summaries restate each row's OWN description and choose no
-- sense — group B discipline. Every UPDATE is content-guarded on the text it
-- removes, so a human who fixes either row first keeps their work.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING HERE, for `infidelity` only:
-- `human_reviewed` is true on it and false on `justice`, and
-- `log_unified_tag_change()` RAISEs when an undeclared `system:%` actor
-- modifies a human_reviewed row. Verified live rather than assumed — and the
-- probe that proves it must write a DIFFERENT value, because a self-assignment
-- changes no column and fires no trigger, which reads exactly like a permissive
-- one.

select set_config('app.actor', 'migration:99991789824132_tag_justice_infidelity_wrong_entity', true);

-- ------------------------------------------------------------------- justice
update public.unified_tags
   set wikidata_id      = null,
       wikipedia_url    = null,
       short_description = 'Fair treatment, and what people are owed.',
       long_description = null
 where slug = 'justice'
   and short_description ilike '%presiding over court proceedings%';

-- ---------------------------------------------------------------- infidelity
update public.unified_tags
   set wikidata_id      = null,
       wikipedia_url    = null,
       short_description = 'A kink built on the fantasy or consensual enactment of unfaithfulness.',
       long_description = null
 where slug = 'infidelity'
   and short_description ilike '%theft of entrusted assets%';

-- Round seventeen's reaper, unchanged: the two tags are now outside the sync's
-- work set, so their codes are orphans and this is what removes them.
select public.run_tag_medical_codes_reap_orphans();

do $verify$
declare
  v_bad  int;
  v_sig  jsonb;
  r      record;
begin
  -- 1. THE REACHED STATE, per row and by name. Soft on what was there before,
  --    hard on what must be true now.
  for r in
    select slug, wikidata_id, wikipedia_url, short_description, long_description,
           description, public.tag_has_prose(description, short_description) as publishable
      from public.unified_tags
     where slug in ('justice', 'infidelity')
  loop
    if r.wikidata_id is not null or r.wikipedia_url is not null then
      raise exception 'round eighteen: % still carries a wrong identifier (% / %)',
        r.slug, r.wikidata_id, r.wikipedia_url;
    end if;
    if r.long_description is not null then
      raise exception 'round eighteen: % still publishes a wrong-subject body', r.slug;
    end if;
    if coalesce(btrim(r.description), '') = '' then
      raise exception 'round eighteen: % lost the description that is the evidence for this repair', r.slug;
    end if;
    if not r.publishable then
      raise exception 'round eighteen: % is no longer publishable under tag_has_prose', r.slug;
    end if;
  end loop;

  -- 2. The wrong SUBJECTS are gone from the prose, tested on the text rather
  --    than on this file's own wording, so a better fix by another session
  --    satisfies it too.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('justice', 'infidelity')
     and (coalesce(short_description, '') ilike '%presiding over court%'
       or coalesce(short_description, '') ilike '%entrusted assets%'
       or coalesce(long_description, '')  ilike '%embezzlement%'
       or coalesce(long_description, '')  ilike '%judicial panel%');
  if v_bad <> 0 then
    raise exception 'round eighteen: % row(s) still publish the wrong subject', v_bad;
  end if;

  -- 3. Both keep a usable summary. "The wrong text is gone" is equally
  --    satisfied by an empty column.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('justice', 'infidelity')
     and coalesce(btrim(short_description), '') = '';
  if v_bad <> 0 then
    raise exception 'round eighteen: % row(s) were left with no summary at all', v_bad;
  end if;

  -- 4. Their codes went with the identifier, and round seventeen's invariant
  --    still holds corpus-wide.
  select count(*) into v_bad
    from public.tag_medical_codes m
    join public.unified_tags t on t.id = m.tag_id
   where t.slug in ('justice', 'infidelity');
  if v_bad <> 0 then
    raise exception 'round eighteen: % clinical code row(s) survive on the two repaired tags', v_bad;
  end if;

  v_sig := public.tag_medical_code_signals();
  if coalesce((v_sig->>'orphan_code_rows')::int, -1) <> 0 then
    raise exception 'round eighteen: orphan invariant regressed to %', v_sig->>'orphan_code_rows';
  end if;
  if coalesce((v_sig->>'nonclinical_code_rows')::int, -1) <> 0 then
    raise exception 'round eighteen: non-clinical invariant regressed to %', v_sig->>'nonclinical_code_rows';
  end if;

  -- 5. THE MIRROR. Nulling two identifiers must not have taken the corpus with
  --    it; both invariants above read zero over an empty table.
  if coalesce((v_sig->>'code_rows_total')::int, 0) < 370 then
    raise exception 'round eighteen: only % code rows remain — this over-reached', v_sig->>'code_rows_total';
  end if;
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active' and wikidata_id ~ '^Q[0-9]+$';
  if v_bad < 1500 then
    raise exception 'round eighteen: only % active tags still carry an identifier — this over-reached', v_bad;
  end if;
end
$verify$;
