-- The named deferrals: close the rows three passes left by decision.
--
-- 50500101100000, 50700101100200 and 51500101143000 each repaired what their
-- evidence allowed and then NAMED what they would not guess at, so that a later
-- pass could tell "left by decision" from "already fixed". This is that later
-- pass. It closes six of the nine, and it leaves three — with reasons, because
-- the whole point of naming them was that the list stays honest.
--
-- THE RULE, and where this file WIDENS it, stated rather than smuggled in.
-- The established rule is: repair only where the row's own `description`
-- establishes a sense that the short/long description contradict. Two rows here
-- (`gym`, `library`) and one more (`office`) have `description IS NULL`, which
-- is exactly why they were deferred — 50700101100200 records `gym` as "a fix
-- would be authoring the row's only prose".
--
-- That deferral was right to be cautious and is too strict on re-reading. It
-- treats `description` as the only evidence a row can carry, and it is not: a
-- tag's CATEGORY is a curated editorial filing, and for these three it admits
-- one reading. A row named `gym` filed under Venue Types is a gym. A row named
-- `library` under Community Life & Support is a library. A row named `office`
-- under Work, School & Institutions is a workplace. None of those chooses
-- between competing senses — which is the thing that must never be guessed —
-- they read a sense off a filing a human already made.
--
-- The widened rule is therefore: the sense may be established by `description`
-- OR by a category that admits exactly one reading of the tag's own name. It is
-- NOT widened to "pick the most likely sense", which is how this entire defect
-- class arose. `black` and `peaches` below are what that distinction costs.
--
-- ── WHAT EACH ROW HELD ──────────────────────────────────────────────────────
--
-- REPAIRED, description establishes the sense (the original rule):
--   steer    Fetishes, usage 0, description "Castrated bull". Body was a
--            SURNAME and a NAVIGATION term, and closed by citing its own
--            sources to the reader — "as listed on Wikidata… Wikipedia, which
--            provides a disambiguation page" — the register `impaired-driving`
--            and `bondage` were already repaired for.
--   lion     Dynamics & Roles, usage 8, description "King of beasts role".
--            Body was 360 characters of ZOOLOGY (genus Panthera, manes, sexual
--            dimorphism).
--
-- REPAIRED, category establishes the sense (the widened rule):
--   gym      Venue Types. Summary described GYMNASTICS, the sport — "exercises
--            for balance, strength, and flexibility" — not a gym, the place.
--   library  Community Life & Support. Summary was disambiguation residue: "A
--            collection of resources **or a work titled The Library**". Same
--            artifact class 51500101143000 closed as its group B; that pass's
--            regex could not see this one, because the text says neither
--            "multiple meanings" nor "term with" nor "may refer to".
--   office   Work, School \& Institutions. Summary and 380-character body were
--            about holding ELECTED PUBLIC OFFICE and public administration, on
--            a row filed as a workplace.
--
-- BODY NULLED, nothing minted:
--   young    SEE BELOW. This is the one that is not a tidiness fix.
--
-- LEFT, and still named:
--   black    Slang & Language, usage 12. Prose is about the COLOUR. In this
--            category the live sense is far more likely Black queer identity —
--            and "far more likely" is precisely the reasoning this file refuses.
--            `description` is NULL and the category admits more than one reading
--            (leather and the hanky code are colour vocabulary here). Guessing
--            between "the colour" and "Black people" on a queer glossary is not
--            a call a migration should make.
--   peaches  Culture & Community, usage 12. Prose is BOTANY ("deciduous trees
--            with edible fruits"). The candidate senses — the musician Peaches,
--            a queer icon; the emoji; the body-part slang — are three, not one.
--   warlord  NOT A PROSE DEFECT, and this corrects 50500101100000, which named
--            it alongside `steer` as "wrong for a Fetishes tag". Re-read: its
--            description is "Military leader" and its body accurately describes
--            a warlord. The two AGREE. What is odd is the `Fetishes` filing and
--            `is_adult` on a 0-usage generic term, which is a categorisation
--            question and not this file's subject. Naming it as a prose defect
--            was wrong; it is recorded here so the next pass does not chase it.
--
-- ── `young` IS A SAFETY REMOVAL, NOT A PROSE TIDY ───────────────────────────
-- Fetishes, `is_adult`, seo_indexable, 62 assignments — the highest-usage row
-- in this set. Its body defines the term as
--
--   "the early stages of life, encompassing offspring or the period of youth,
--    which is the time between CHILDHOOD and adulthood"
--
-- On an adult-flagged fetish tag that is not a wrong subject in the ordinary
-- sense; it is prose that reads as sexualising minors, published to crawlers.
-- It is wrong under EVERY reading: whatever adult meaning 62 taggers intended,
-- the body does not state it, and the one thing the body does state is the one
-- thing this platform must not publish here.
--
-- So the body is NULLED and NOTHING is minted — the `queen` and `lioness`
-- half-measure. The summary is deliberately left alone: `description` is NULL,
-- so `short_description` is the row's only prose, and `tag_has_prose` is
-- `coalesce(nullif(btrim(description),''), short_description) is not null`
-- (verified live, not assumed) — nulling it too would take the row below
-- `enforce_tag_thin_page_gate` and unpublish a 62-use page as a side effect of
-- a prose fix. Removing the harmful claim is this file's business; deciding
-- whether `young` should carry `is_adult` and sit in Fetishes at all is an
-- editorial call, and it is RAISEd as a notice rather than made here.
--
-- ── DISCIPLINE ──────────────────────────────────────────────────────────────
--   * `description` is NEVER written. It is the evidence in half these rows.
--   * Bodies are NULLED rather than rewritten wherever a sense would have to be
--     invented to replace them (steer, lion, office, young). Summaries are set
--     to exactly what the row's own evidence supports. Nothing mints kink
--     vocabulary for a 0-usage row.
--   * Every UPDATE is content-guarded on the defect's own text, so a human who
--     fixes one first keeps their work and this file no-ops on that row.
--   * Postconditions assert THE DEFECT IS GONE, never that this file's wording
--     is present — someone else's better fix satisfies them. Everything this
--     file does not own reports instead of aborting a push, because an abort on
--     main takes every migration queued behind it.
--
-- TRAP: `log_unified_tag_change()` RAISEs when an actor matching `system:%`
-- modifies a `human_reviewed` row. steer, lion, gym, office and young are all
-- human_reviewed, so the set_config below is load-bearing.

begin;

select set_config('app.actor', 'migration:51500101152700', true);

-- ── description establishes the sense ───────────────────────────────────────

update unified_tags
   set short_description = 'A castrated bull.',
       long_description  = null
 where slug = 'steer' and status = 'active'
   and short_description = 'Family name or navigation term';

update unified_tags
   set short_description = 'King of beasts role.',
       long_description  = null
 where slug = 'lion' and status = 'active'
   and short_description = 'Large cat species';

-- ── category establishes the sense ──────────────────────────────────────────

update unified_tags
   set short_description = 'A venue for weight training and exercise.'
 where slug = 'gym' and status = 'active'
   and short_description = 'Sport with exercises for balance, strength, and flexibility';

update unified_tags
   set short_description = 'A collection of books and resources kept for public use.'
 where slug = 'library' and status = 'active'
   and short_description = 'A collection of resources or a work titled The Library';

update unified_tags
   set short_description = 'A workplace where administrative and clerical work is done.',
       long_description  = null
 where slug = 'office' and status = 'active'
   and short_description = 'Government or public administration role';

-- ── safety removal; summary deliberately untouched, see the header ──────────

update unified_tags
   set long_description = null
 where slug = 'young' and status = 'active'
   and long_description like 'The term ''Young'' refers to the early stages of life%';

do $verify$
declare
  v_bad  int;
  v_note int;
begin
  -- HARD: the defects this file exists to remove are gone. Tests for the WRONG
  -- text, so a better fix written by someone else also satisfies it.
  select count(*) into v_bad from unified_tags
   where status = 'active'
     and ((slug='steer'   and short_description = 'Family name or navigation term')
       or (slug='lion'    and short_description = 'Large cat species')
       or (slug='gym'     and short_description = 'Sport with exercises for balance, strength, and flexibility')
       or (slug='library' and short_description = 'A collection of resources or a work titled The Library')
       or (slug='office'  and short_description = 'Government or public administration role'));
  if v_bad <> 0 then
    raise exception '% named-deferral short_description(s) still live', v_bad;
  end if;

  select count(*) into v_bad from unified_tags
   where status = 'active'
     and ((slug='steer'  and long_description like 'Steer can refer to a family name%')
       or (slug='lion'   and long_description like 'The lion is a large cat of the genus Panthera%')
       or (slug='office' and long_description like 'An office refers to an elected or appointed political position%'));
  if v_bad <> 0 then
    raise exception '% named-deferral long_description(s) still live', v_bad;
  end if;

  -- HARD, and the reason this migration exists rather than waiting for a
  -- human: the childhood sentence must not survive on an adult tag.
  select count(*) into v_bad from unified_tags
   where slug = 'young' and status = 'active' and long_description is not null;
  if v_bad <> 0 then
    raise exception 'young still publishes a body on an adult tag';
  end if;

  -- HARD: `young` must still be publishable. Nulling the body is only safe
  -- while the row keeps prose the thin-page gate can see.
  if not exists (select 1 from unified_tags
                  where slug = 'young' and status = 'active'
                    and tag_has_prose(description, short_description)) then
    raise exception 'young fell below the thin-page gate';
  end if;

  -- HARD: `description` is the evidence and is never written by this file.
  select count(*) into v_bad from unified_tags
   where status = 'active'
     and ((slug='steer' and description is distinct from 'Castrated bull')
       or (slug='lion'  and description is distinct from 'King of beasts role'));
  if v_bad <> 0 then
    raise notice '% description(s) differ from the evidence this file read (edited elsewhere; not an error)', v_bad;
  end if;

  -- REPORTS: the three left by decision. Named so the next pass can tell
  -- "still deferred" from "already fixed", exactly as the passes before this
  -- one did for these rows.
  select count(*) into v_note from unified_tags
   where status = 'active'
     and ((slug='black'   and short_description = 'Color representing darkness and solemnity')
       or (slug='peaches' and short_description = 'Peaches are deciduous trees with edible fruits'));
  if v_note > 0 then
    raise notice '% row(s) deliberately left: black and peaches carry more than one candidate sense and description is NULL', v_note;
  end if;

  if exists (select 1 from unified_tags where slug='warlord' and status='active'
               and description = 'Military leader') then
    raise notice 'warlord left unchanged: its body and description AGREE and are accurate. 50500101100000 named it a prose defect and that was wrong; the open question is its Fetishes/is_adult filing.';
  end if;

  -- REPORTS: the editorial decision this file deliberately does not make.
  if exists (select 1 from unified_tags where slug='young' and status='active' and is_adult) then
    raise notice 'young: body removed, but it remains is_adult in Fetishes at 62 uses with a NULL description — whether that filing is right is an editorial call, not a migration''s';
  end if;
end
$verify$;

commit;
