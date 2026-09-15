-- Round seven of the disowned-prose backlog: 13 rows whose prose describes a
-- categorically different KIND of thing than the tag, on rows whose own
-- `description` establishes the sense.
--
-- Same rule as 51500101143000 / 51700101143000 / 61000101174500, unchanged:
-- repair ONLY where the row's own `description` establishes a sense the
-- short/long description contradict, derive the new summary FROM that
-- description, and NEVER write `description` itself — it is the evidence that
-- justifies the repair, and overwriting it destroys what made the change
-- defensible.
--
-- HOW THIS TRANCHE WAS FOUND, because it corrects the previous one's method.
-- Rounds two through five worked this backlog in USAGE ORDER and round four
-- concluded the head was "worked out". Round five already corrected that once.
-- This pass re-read the surviving set sorted by WHAT THE PROSE IS ABOUT rather
-- than by usage, and the density is in the zero-usage tail: 12 of these 13 rows
-- have usage_count = 0, so every usage-ordered sweep sorted them below anything
-- anyone ever read. A hit rate measured over one ordering does not transfer to
-- another.
--
-- THREE SHAPES, kept labelled because a later reader must not take the
-- loosest group's licence and apply it to the rest.
--
-- A. RICH DESCRIPTION, WRONG PROSE (6 rows). The row's own description is long
--    and explicitly states the kink or scene sense, and the published prose is
--    the everyday one. These are the least ambiguous repairs in the whole
--    backlog:
--      pet-owner   description literally opens "In BDSM, a Pet Owner is someone
--                  who takes the Dominant or Caretaker role in a pet play
--                  dynamic" — and the page published "an individual who has a
--                  pet, which can include dogs, cats, birds".
--      play-room   description: "a designated space at an event, dungeon, or
--                  private venue where BDSM or kink-related activities ... are
--                  permitted" — page published "also known as a recreation
--                  room".
--      rumpus-room description: "In the context of kink ... set aside for
--                  especially disruptive and/or messy play" — page published a
--                  basement games room.
--      long-hair   description: "Sexual attraction to long hair, including
--                  touching, pulling, or styling" — page published the
--                  HAIRSTYLE ("grow past the shoulder but no longer than the
--                  waist").
--      scent       description: "Arousal from body odors, perfumes, or other
--                  scents" — page published "a smell caused by one or more
--                  volatilized chemical compounds".
--      rough-sex   description: "Intense physical sexual activity" — page
--                  published the definition of BDSM, which is a SEPARATE live
--                  tag. The corpus stated BDSM twice and the rough-sex page
--                  said nothing about rough sex. The /tags/aids shape.
--
-- B. THIN DESCRIPTION, WRONG PROSE (5 rows). The description states what the
--    tag is in a few words — enough to fix the summary, NOT enough to author a
--    body from. So the summary is set to exactly what the description supports
--    and the body is NULLED, never invented: the `steer`/`lion` rule of
--    51500101152700 and the `doe`/`fae`/`flock` group of 60000301100100.
--      offering      "Gift or sacrifice" vs "putting forward an item for
--                    consideration" — the same procedural artifact that put
--                    manuscript submission on `submission`.
--      maid-service  "Performing domestic tasks" vs a COMMERCIAL cleaning
--                    company serving "homes, hotels, and other e[stablishments]".
--      adventurer    "Explorer or seeker of new experiences" (a PERSON) vs a
--                    definition of "adventure" (the ACTIVITY) — the
--                    `toymaker`->toys and `pleaser`->pleasure shape.
--      feedee        "Person who is fed" (a ROLE) vs "a fetishism of gaining
--                    weight" (the PRACTICE). Same scope error.
--      older-women   body is already null; only the summary is wrong, and
--                    wrong in a specific way worth naming: the description
--                    establishes an ATTRACTION ("Sexual attraction to older
--                    female-identified partners ... maturity, confidence, and
--                    experience"), and the summary published "Women aged 50+"
--                    — a DEMOGRAPHIC with an invented numeric threshold that
--                    appears nowhere in the row.
--
-- C. BODY ONLY (2 rows), because the summary is already correct — the
--    `casting`/`trauma`/`submission` rule of repairing only the wrong FIELD.
--      down-low   summary "Men who have sex with men while keeping it secret."
--                 is correct and matches the description exactly. The BODY
--                 opened "The term Down-Low has several meanings, including a
--                 rap group formed in Kaiserslautern, Germany, an album by
--                 Betzefer, and a song by Doja Cat."
--      alpha-pet  summary "Term for a dominant pet" is consistent with the
--                 description "Dominant pet in hierarchy". The BODY described
--                 "a pet that exhibits dominant behavior within a multi-pet
--                 household" — actual animals.
--
-- FIVE ROWS WERE READ AND DELIBERATELY LEFT, each for a DIFFERENT reason, and
-- the reasons are recorded because "deferred" must stay distinguishable from
-- "fixed" for the next pass:
--
--   reynard        Its description is "Clever fox character" and its body is
--                  the medieval Reynard fable cycle. Those AGREE — Reynard
--                  genuinely is a clever fox character from medieval fables.
--                  Being filed under Fetishes is a FILING question, which is
--                  the `warlord` disposition, not a wrong subject.
--   pet            description "Animal companion role" agrees with the prose,
--                  and the body is a deliberate tag-usage note scoping the tag
--                  to pets in LGBTQ+ travel and community. Note this row is
--                  left while `pet-owner` and `alpha-pet` are repaired: the
--                  evidence differs PER ROW, and pet-owner's own description
--                  says "In BDSM" where this one says nothing of the kind.
--   bicon          Its `description` is ITSELF a disambiguation list ("Bicon
--                  may refer to: BiCon (UK) ... Bicon Dental Implants"), so it
--                  establishes no single sense — and this file never writes
--                  `description`. Unrepairable under the rule rather than
--                  overlooked; 60000301100100 recorded the same finding.
--   accipiosexual  THREE readings disagree: description says "Sexual
--                  attraction that varies in intensity", while summary and
--                  body agree with each other on something else entirely
--                  ("attraction only after they have formed a strong emotional
--                  bond" — which is what `demisexual` means). Guessing a sense
--                  is how this entire class arose, so nothing is written here.
--                  The `queen` rule of 51500101144000.
--   poppet         The generic-dictionary-sense cohort, deferred by
--                  61000101174500. No new evidence has appeared since, and
--                  reversing a stated deferral without new evidence is churn.
--
-- SAFETY OF NULLING A BODY is asserted rather than reasoned about:
-- `enforce_tag_thin_page_gate` reads `tag_has_prose(description,
-- short_description)` only, and every row here keeps its description, so none
-- can fall below the gate. `long_description` is also NOT in
-- `trg_search_documents_tag`'s column list, so a body-only repair causes zero
-- search churn.
--
-- 11 of the 13 rows are `human_reviewed`, so the actor declaration is
-- load-bearing, not decoration: log_unified_tag_change() RAISEs when an
-- undeclared `system:%` actor modifies such a row.
--
-- Verified before commit: every content guard below was checked against the
-- live row, and the whole file was dry-run on prod in a transaction forced to
-- roll back.

begin;

select set_config('app.actor', 'migration:62000101163000', true);

-- ---------------------------------------------------------------- A: rich description

update unified_tags
   set short_description = 'The Dominant or caretaker role in a pet-play dynamic.',
       long_description  = null
 where slug = 'pet-owner' and status = 'active'
   and short_description = 'Person who owns a pet';

update unified_tags
   set short_description = 'A space at an event or venue where kink play is permitted.',
       long_description  = null
 where slug = 'play-room' and status = 'active'
   and short_description = 'Room for casual use and recreation';

update unified_tags
   set short_description = 'A space set aside for messy or disruptive play.',
       long_description  = null
 where slug = 'rumpus-room' and status = 'active'
   and short_description = 'Multi-purpose room for casual activities';

update unified_tags
   set short_description = 'Attraction to long hair — touching, pulling, or styling it.',
       long_description  = null
 where slug = 'long-hair' and status = 'active'
   and short_description = 'Hair that grows past the shoulder';

update unified_tags
   set short_description = 'Arousal from body odors, perfume, or worn clothing.',
       long_description  = null
 where slug = 'scent' and status = 'active'
   and short_description = 'Smell or scent perceived by humans and animals';

update unified_tags
   set short_description = 'Intense, physically forceful sex.',
       long_description  = null
 where slug = 'rough-sex' and status = 'active'
   and short_description = 'Erotic practices involving domination and sadomasochism';

-- ---------------------------------------------------------------- B: thin description

update unified_tags
   set short_description = 'A gift or sacrifice.', long_description = null
 where slug = 'offering' and status = 'active'
   and short_description = 'Act of submitting for consideration or approval';

update unified_tags
   set short_description = 'Performing domestic tasks as a role.', long_description = null
 where slug = 'maid-service' and status = 'active'
   and short_description = 'Housekeeping and cleaning services';

update unified_tags
   set short_description = 'Someone who seeks out new experiences.', long_description = null
 where slug = 'adventurer' and status = 'active'
   and short_description = 'Exciting, bold undertakings with novel experiences';

update unified_tags
   set short_description = 'The person who is fed.', long_description = null
 where slug = 'feedee' and status = 'active'
   and short_description = 'Fetishism of gaining weight';

update unified_tags
   set short_description = 'Attraction to older women, for their maturity and experience.'
 where slug = 'older-women' and status = 'active'
   and short_description = 'Women aged 50+';

-- ---------------------------------------------------------------- C: body only

update unified_tags
   set long_description = null
 where slug = 'down-low' and status = 'active'
   and long_description like 'The term Down-Low has several meanings%';

update unified_tags
   set long_description = null
 where slug = 'alpha-pet' and status = 'active'
   and long_description like 'The term ''alpha pet'' refers to a pet that exhibits dominant behavior%';

do $verify$
declare
  v_bad int;
  v_slugs text[] := array[
    'pet-owner','play-room','rumpus-room','long-hair','scent','rough-sex',
    'offering','maid-service','adventurer','feedee','older-women',
    'down-low','alpha-pet'];
begin
  -- Postconditions test for the WRONG text, never for this file's own wording.
  -- A check pinned to my replacement aborts `db push` on main the moment
  -- somebody else writes something better first, which strands every migration
  -- queued behind it — the repo-wide blast radius 20360401100100 records and
  -- 61000101174500 very nearly shipped.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs) and short_description in (
     'Person who owns a pet','Room for casual use and recreation',
     'Multi-purpose room for casual activities','Hair that grows past the shoulder',
     'Smell or scent perceived by humans and animals',
     'Erotic practices involving domination and sadomasochism',
     'Act of submitting for consideration or approval',
     'Housekeeping and cleaning services',
     'Exciting, bold undertakings with novel experiences',
     'Fetishism of gaining weight','Women aged 50+');
  if v_bad <> 0 then
    raise exception '% wrong-subject summary(ies) still live', v_bad;
  end if;

  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs) and long_description is not null
     and (long_description like 'A pet owner is an individual who has a pet%'
       or long_description like 'A play room, also known as a recreation room%'
       or long_description like 'A rumpus room is a space used for various purposes%'
       or long_description like 'Long hair refers to any hairstyle%'
       or long_description like 'An odor or scent is a smell caused by%'
       or long_description like 'BDSM refers to a range of erotic practices%'
       or long_description like 'The act of offering refers to the act of putting forward an item%'
       or long_description like 'Maid service refers to a type of domestic help%'
       or long_description like 'An adventure is a novel and exciting undertaking%'
       or long_description like 'Feedee refers to a fetishism of gaining weight%'
       or long_description like 'The term Down-Low has several meanings%'
       or long_description like 'The term ''alpha pet'' refers to a pet that exhibits dominant behavior%');
  if v_bad <> 0 then
    raise exception '% disowned-entity body/bodies still live', v_bad;
  end if;

  -- Nulling a body must never unpublish a page.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs)
     and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception '% row(s) fell below the thin-page gate', v_bad;
  end if;

  -- The description is the evidence this file reasoned from; it is never
  -- written here, so losing one means the justification is gone.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs) and description is null;
  if v_bad <> 0 then
    raise exception '% row(s) lost the description this file reasoned from', v_bad;
  end if;

  -- Report the deferrals so the next pass can tell "deferred" from "fixed".
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug in ('reynard','pet')
     and long_description is not null;
  if v_bad > 0 then
    raise notice '% row(s) left: description AGREES with the prose, so this is a filing question, not a wrong subject (the warlord disposition)', v_bad;
  end if;

  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = 'bicon' and description like 'Bicon may refer to%';
  if v_bad > 0 then
    raise notice 'bicon left: its own description is a disambiguation list, so no single sense is established and this file never writes description';
  end if;

  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = 'accipiosexual'
     and description = 'Sexual attraction that varies in intensity';
  if v_bad > 0 then
    raise notice 'accipiosexual left: description, summary and body give three different readings; guessing a sense is how this class arose (the queen rule)';
  end if;

  select count(*) into v_bad from unified_tags
   where status = 'active'
     and slug in ('poppet','butler','doll','catboy','hedonist','freak','teacher','priest','villain');
  if v_bad > 0 then
    raise notice '% generic-dictionary-sense row(s) still deferred: each row''s own description AGREES with its prose, so the rule cannot reach them', v_bad;
  end if;

  select count(*) into v_bad from unified_tags
   where status = 'active' and long_description is not null
     and slug in ('goat','frog','bunny','tiger','panda','lamb','meerkat','strawberry','wolf','duck','feral');
  if v_bad > 0 then
    raise notice '% zoology-on-a-role row(s) still deferred (the lion rule)', v_bad;
  end if;

  select count(*) into v_bad from unified_tags
   where status = 'active' and long_description is not null
     and slug in ('dragon','fairy','familiar','genie','goblin','god','goddess','mermaid','succubus','unicorn','zombie','satyress');
  if v_bad > 0 then
    raise notice '% mythology-on-a-role row(s) deferred: a NEW family, same shape as zoology-on-a-role', v_bad;
  end if;

  select count(*) into v_bad from unified_tags
   where status = 'active' and long_description is not null
     and slug in ('jarl','king','knight','lord','mister','mademoiselle','priestess','squire','tyrant','huntress');
  if v_bad > 0 then
    raise notice '% title-on-a-role row(s) deferred: a NEW family, same shape', v_bad;
  end if;
end
$verify$;

commit;
