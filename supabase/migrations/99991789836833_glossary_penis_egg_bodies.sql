-- Two bodies that outlived the sweep, one of them contradicting its own row.
--
-- FIFTH AND LAST OCCURRENCE OF THE SAME MISTAKE. The ledger, all mine:
--
--   #3807  fixed two namesake SUMMARIES, left the BODIES      -> #3835
--   #3810  fixed 13 gendered DESCRIPTIONS, left summaries+bodies -> #3838
--   #3838  swept 11 bodies by regex                            -> this file
--
-- `penis` is the sharp one. Its description is the inclusive sentence #3810
-- added — "Trans women, non-binary people and intersex people have penises too
-- — this is anatomy, not gender" — while its body still reads "The penis is a
-- male reproductive organ ... It is a part of the male genitalia." Because
-- tagDetail() renders long_description FIRST, the body is what a reader is
-- served, so the row published the exact claim its own description exists to
-- refuse. A page arguing with itself is worse than one that is merely dated.
--
-- WHY THE #3838 SWEEP MISSED IT, and the lesson is about timing not regexes:
-- that file selected the 13 #3810 slugs whose body matched
-- \m(male|female|men|women)\M and got ELEVEN. `penis` was not among them. Its
-- body plainly contains "male", so either it was rewritten by a concurrent
-- session between the SELECT and the UPDATE, or it was absent then. Either way
-- the selection was a snapshot and the corpus moved under it. A regex sweep
-- over a live table repairs the rows that matched WHEN IT RAN; re-measure after
-- merging rather than trusting the count the migration reported.
--
-- `egg` was never in scope at all: #3810 selected on gendered DESCRIPTIONS and
-- `egg`'s description is zoology rather than gendered ("an organic vessel grown
-- by an animal"), so the row never entered any of the three passes while its
-- body said "An egg is a female reproductive cell."
--
-- DELIBERATELY NOT TOUCHED: `female-ejaculation`, whose summary says "during
-- female orgasm". The word is in the TERM'S OWN NAME, which is the
-- `ceterosexual` case — there the word is doing real work and removing it would
-- make the entry describe something else. Its description is already the
-- inclusive one ("The expulsion of fluid from the urethra during sexual arousal
-- or orgasm"). Whether the headword itself should change is a vocabulary
-- decision, not a prose repair, and under-reaching is the correct error. A
-- postcondition asserts it still says so, so a later sweep cannot take it by
-- accident.
--
-- Bodies are NULLED, not rewritten: both rows carry a correct, complete
-- description and detail.ts falls back to it. Asserted against tag_has_prose.
--
-- Guarded by src/lib/__tests__/glossaryPenisEggBodies.test.ts.

begin;

select set_config('app.actor', 'migration:99991789836833_glossary_penis_egg_bodies', true);

update unified_tags set long_description = null
where slug = 'penis' and long_description ilike '%male reproductive organ%';

update unified_tags set long_description = null
where slug = 'egg' and long_description ilike '%female reproductive cell%';

-- `egg`'s summary and description are also the zoology sense on a row whose
-- siblings (ovaries, fallopian-tubes) now read as human reproductive anatomy.
update unified_tags set
  description = 'The reproductive cell released from an ovary at ovulation. If fertilised it implants in the uterus; if not, it is shed with the uterine lining.',
  short_description = 'The reproductive cell released from an ovary at ovulation.'
where slug = 'egg' and description ilike '%organic vessel grown by an animal%';

-- `sexual-arousal` is the fourth, and it is a DIFFERENT shape from the other
-- three: its body is accurate physiology told in a binary — "In males, arousal
-- leads to erection and pre-ejaculate, while in females, it causes engorged
-- sexual tissues, cervical changes, and vaginal lubrication." Nothing there is
-- factually wrong; it names the two anatomies by gender instead of by anatomy,
-- which on this platform puts the reader outside their own body.
--
-- So this one is an exact-phrase replace() rather than a null: the physiology
-- is worth keeping and a replace() cannot author prose, so every other clause
-- survives byte-identically. A postcondition asserts the surviving detail.
update unified_tags set
  long_description = replace(
    long_description,
    'In males, arousal leads to erection and pre-ejaculate, while in females, it causes engorged sexual tissues, cervical changes, and vaginal lubrication.',
    'In people with a penis, arousal leads to erection and pre-ejaculate; in people with a vulva, it causes engorged tissue, cervical changes and vaginal lubrication.')
where slug = 'sexual-arousal' and long_description ilike '%In males, arousal leads to erection%';

-- ============================ postconditions ============================
do $verify$
declare v_bad int; v_n int;
begin
  -- 1. reached state, counted positively
  select count(*) into v_n from unified_tags
  where slug in ('penis','egg')
    and status = 'active'
    and long_description is null
    and tag_has_prose(description, short_description);
  if v_n <> 2 then raise exception 'expected 2 rows body-cleared and publishable, found %', v_n; end if;

  -- 2. penis no longer contradicts itself on any field
  select count(*) into v_bad from unified_tags
  where slug = 'penis'
    and (coalesce(long_description,'') ~* '\m(male|female)\M'
      or coalesce(short_description,'') ~* '\m(male|female)\M');
  if v_bad <> 0 then raise exception 'penis still publishes a gendered summary or body'; end if;

  select count(*) into v_n from unified_tags
  where slug = 'penis' and description ilike '%Trans women, non-binary people and intersex people%';
  if v_n <> 1 then raise exception 'penis lost the inclusive sentence this file exists to stop contradicting'; end if;

  -- 3. THE WHOLE POINT, re-measured across all three fields AFTER the write —
  --    the check #3838 ran before the corpus moved under it.
  select count(*) into v_bad from unified_tags
  where slug in ('erectile-dysfunction','clitoris','ovaries','fallopian-tubes','foreskin','perineum',
                 'pregnancy','seminal-vesicles','sperm','testicle','vagina','uncircumcised','penis','egg',
                 'anus','labia','sexual-arousal')
    and (coalesce(short_description,'') ~* '\m(male|female)\M'
      or coalesce(long_description,'')  ~* '\m(male reproductive|female reproductive|female sex organ|in males|placental mammals)\M');
  if v_bad <> 0 then
    raise exception '% rows across the pass are still gendered on a rendered field', v_bad;
  end if;

  -- 3b. sexual-arousal kept the physiology the replace() was meant to preserve.
  --     A replace() that ate the body would satisfy check 3 just as happily.
  select count(*) into v_n from unified_tags
  where slug = 'sexual-arousal'
    and long_description ilike '%people with a penis%'
    and long_description ilike '%cervical changes%'
    and long_description ilike '%body''s preparation for%';
  if v_n <> 1 then raise exception 'sexual-arousal lost the physiology it was meant to keep'; end if;

  -- 4. CONTROLS. female-ejaculation keeps its wording — the word is in the
  --    term's own name. A sweep broad enough to take it satisfies check 3 too.
  select count(*) into v_bad from unified_tags
  where (slug = 'female-ejaculation' and coalesce(short_description,'') !~* 'female')
     or (slug = 'ceterosexual' and description !~* 'neither exclusively male nor female')
     or (slug = 'feminism' and description !~* 'women''s rights');
  if v_bad <> 0 then raise exception '% control rows were swept', v_bad; end if;
end
$verify$;

commit;
