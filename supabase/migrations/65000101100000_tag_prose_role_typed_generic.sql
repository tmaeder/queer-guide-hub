-- Round nine of the disowned-prose backlog: 9 rows, and the finding is that a
-- cohort deferred FIVE times running was reachable all along.
--
-- Same rule as 51500101143000 / 51700101143000 / 61000101174500 /
-- 62000101163000 / 64000101100000, unchanged: repair ONLY where the row's own
-- `description` establishes a sense the summary contradicts, derive the new
-- summary FROM that description, and NEVER write `description` itself -- it is
-- the evidence that justifies the repair.
--
-- THE GENERIC-SENSE COHORT WAS NOT UNREACHABLE. IT WAS MISREAD.
-- Rounds four, five, the tail and round eight each deferred "the generic-sense
-- cohort" on the stated ground that each row's `description` AGREES with its
-- prose, so the original rule cannot reach it. That is true of some of these
-- rows and FALSE of others, and the difference is one word.
--
--   bunny    description "Cute animal role"  summary "Small mammal in Leporidae family"
--   doll     description "Toy-like role"     summary "Model of a human or humanoid character"
--   meerkat  description "Small mammal role" summary "Small mongoose species found in southern Africa"
--   balloon  description "Balloon fetish role" summary "Inflatable bag made of flexible material"
--
-- Read quickly, "Cute animal role" and "Small mammal in Leporidae family" look
-- like two ways of saying rabbit, which is how this cohort was waved past five
-- times. They are not. The description TYPES the tag -- it says this row is a
-- ROLE a person takes -- and the summary asserts the tag names an ANIMAL, an
-- OBJECT or a HISTORICAL INSTITUTION. That is a contradiction about what kind
-- of thing the tag is, which is exactly what the original rule is for. The
-- word `role` in the description is the evidence, and it was there all along.
--
-- TWO GROUPS, kept labelled so a later reader cannot take the second group's
-- licence and apply it to the first.
--
-- A. THE DESCRIPTION TYPES THE TAG AS A ROLE AND THE PROSE PUBLISHES THE
--    LITERAL REFERENT (5 rows). Each replacement says only what the
--    description already says -- that this is a role -- plus which animal or
--    object the persona is named for, which comes from the tag's own name. No
--    new sense is chosen and no scene detail is invented:
--      bunny    a pet-play role, not the family Leporidae.
--      doll     a role someone takes, not a moulded toy.
--      meerkat  a pet-play role, not a mongoose of southern Africa.
--      balloon  a fetish role (its description says so outright), not an
--               inflatable bag made of flexible material.
--      thrall   "Bound servant" types it as a servitude role; the summary
--               published the Norse legal institution instead.
--
-- B. THE SUMMARY STATES NOTHING A READER CAN USE (4 rows), the group-B shape
--    of 64000101100000. `chauffeur` "Chauffeur" and `dawg` "Dawg" define the
--    term with the term (the hardpoint / impaired-driving / hiv-aids defect);
--    `edge-switch` "BDSM practice" names no subject at all; `lactation-play`
--    "Lactation play is a form of erotic play" says only that the term exists.
--    Each replacement restates the row's own `description` -- and for the two
--    rows that have a correct body, that body -- and nothing else. This group
--    CHOOSES NO SENSE, so it is strictly weaker than group A.
--
-- BODIES. Three group-A rows carry a body that is pure zoology or object
-- encyclopedia on a role page (`bunny` rabbits as "herbivores, prey animals,
-- livestock, and pets"; `doll` on toys and religious rituals; `meerkat` on
-- brindled coat patterns). Those bodies are NULLED rather than replaced: each
-- row's description is a single line, which is enough to state what the tag is
-- and not enough to write a body from, so minting one would be the guess this
-- whole class came from -- the doe/fae/flock treatment of 60000301100100.
-- Nulling is safe and is ASSERTED below rather than assumed:
-- `enforce_tag_thin_page_gate` reads tag_has_prose(description,
-- short_description) only, and all three keep both. `long_description` is also
-- absent from `trg_search_documents_tag`'s column list, so this causes no
-- search churn. `balloon` and `thrall` already have no body; `edge-switch` and
-- `lactation-play` have CORRECT bodies and are left untouched.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING HERE, verified live on this corpus
-- rather than assumed: all 9 rows are `human_reviewed`, and the undeclared
-- UPDATE returns
--   human_reviewed tag <uuid> cannot be modified by system:trigger
-- Round four's tranche was the opposite case (all rows human_reviewed=false,
-- where set_config is attribution only). Each file states which case it is in
-- so the next pass does not copy the wrong precedent from whichever it opens.
--
-- DEFERRED, and now with a SHARPER reason than "the generic-sense cohort",
-- because that label was hiding two different things:
--   wolf, knight, reynard, familiar, satyress, goblin, villain
--     The description is ITSELF the generic sense -- "Pack animal",
--     "Chivalrous warrior", "Clever fox character", "Mischievous creature" --
--     so there is no contradiction on the row and nothing to derive from.
--     These are the rows the earlier deferrals correctly describe.
--   angel, bimbo, catgirl, butler, acolyte, bootblack
--     The description does type them as roles, but the summary is NARROW
--     rather than a different subject: an angel IS a supernatural entity, a
--     butler IS a domestic worker, an acolyte IS an assistant in religious
--     services. Under-reaching is the correct error.
--   pet
--     Names TWO senses at once -- description "Animal companion role" against
--     a body about pet-friendly travel destinations -- so choosing between
--     them is the guess this class came from (the host/unicorn shape).
--   warlord, warrior-princess, partners-in-mischief, chubby-chaser
--     Already deferred with reasons by rounds five, eight and the tail; those
--     reasons still hold and are not revisited here.

select set_config('app.actor', 'admin:tag-prose-role-typed-generic', true);

-- ---------------------------------------------------------------- group A --
-- Every UPDATE is guarded on the defect still being present, so a human or a
-- concurrent session that repairs a row first keeps their work and this file
-- no-ops instead of overwriting them: soft on preconditions, hard on
-- postconditions.

update public.unified_tags
   set short_description = 'A pet-play role built on a rabbit persona.',
       long_description  = null
 where slug = 'bunny' and short_description = 'Small mammal in Leporidae family';

update public.unified_tags
   set short_description = 'A role in which someone takes on a doll persona.',
       long_description  = null
 where slug = 'doll' and short_description = 'Model of a human or humanoid character';

update public.unified_tags
   set short_description = 'A pet-play role built on a meerkat persona.',
       long_description  = null
 where slug = 'meerkat' and short_description = 'Small mongoose species found in southern Africa';

update public.unified_tags
   set short_description = 'A fetish role centred on balloons.'
 where slug = 'balloon' and short_description = 'Inflatable bag made of flexible material';

update public.unified_tags
   set short_description = 'A servitude role in which one partner is bound to another''s service.'
 where slug = 'thrall' and short_description = 'Historical Scandinavian slave or serf';

-- ---------------------------------------------------------------- group B --
-- Each of these restates the row's own `description`, and for the two rows
-- with a correct body, that body. No sense is chosen.

update public.unified_tags
   set short_description = 'A service role in which one partner drives the other.'
 where slug = 'chauffeur' and short_description = 'Chauffeur';

update public.unified_tags
   set short_description = 'A slang term for a man.'
 where slug = 'dawg' and short_description = 'Dawg';

update public.unified_tags
   set short_description = 'Someone who swaps between topping and bottoming within edge play.'
 where slug = 'edge-switch' and short_description = 'BDSM practice';

update public.unified_tags
   set short_description = 'Erotic play involving breastfeeding and breast milk, also called adult nursing.'
 where slug = 'lactation-play' and short_description = 'Lactation play is a form of erotic play';

do $verify$
declare
  v_bad int;
  v_seam text[] := array['bunny','doll','meerkat','balloon','thrall',
                         'chauffeur','dawg','edge-switch','lactation-play'];
begin
  -- HARD: every defect this file exists to remove is gone. Tests for the WRONG
  -- text rather than for this file's own wording, so a better fix written by
  -- someone else also satisfies it -- the shape that let 18 of 34 rows be cut
  -- from 60000301100000/100100, and two more from 64000101100000, without any
  -- of those files failing on main.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and short_description in ('Small mammal in Leporidae family',
                               'Model of a human or humanoid character',
                               'Small mongoose species found in southern Africa',
                               'Inflatable bag made of flexible material',
                               'Historical Scandinavian slave or serf',
                               'Chauffeur','Dawg','BDSM practice',
                               'Lactation play is a form of erotic play');
  if v_bad > 0 then
    raise exception 'role-typed seam: % row(s) still publish the disowned summary', v_bad;
  end if;

  -- HARD: the reached state, counted positively. A check that only counts rows
  -- in a BAD state returns zero for a slug that has gone missing from the
  -- corpus entirely, which the soft preconditions above deliberately allow.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_seam)
     and coalesce(short_description,'') <> ''
     and lower(short_description) <> lower(name);
  if v_bad <> 9 then
    raise exception 'role-typed seam: % of 9 rows carry a usable summary', v_bad;
  end if;

  -- HARD: no row was left below the thin-page gate, which reads
  -- tag_has_prose(description, short_description) and nothing else. This is
  -- what makes nulling the three zoology bodies safe.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_seam)
     and not tag_has_prose(description, short_description);
  if v_bad > 0 then
    raise exception 'role-typed seam: % row(s) fell below the thin-page gate', v_bad;
  end if;

  -- HARD: the three zoology/object bodies are gone.
  select count(*) into v_bad from public.unified_tags
   where slug in ('bunny','doll','meerkat')
     and coalesce(long_description,'') <> '';
  if v_bad > 0 then
    raise exception 'role-typed seam: % literal-referent body/bodies survive', v_bad;
  end if;

  -- HARD: the two rows whose bodies are CORRECT keep them. Nulling a good body
  -- would be the mirror error of leaving a wrong one.
  select count(*) into v_bad from public.unified_tags
   where slug in ('edge-switch','lactation-play')
     and coalesce(long_description,'') = '';
  if v_bad > 0 then
    raise exception 'role-typed seam: % correct body/bodies were destroyed', v_bad;
  end if;

  raise notice 'role-typed seam: 9 rows (5 role-typed, 4 empty summaries); 3 literal-referent bodies nulled';
end
$verify$;
