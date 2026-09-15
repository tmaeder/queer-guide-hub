-- Disowned prose, round TEN: the role-typed seam, completed (2026-09-15)
--
-- Round nine (65000101100000) found that the "generic-sense cohort" four earlier
-- passes had deferred as structurally unreachable was reachable after all: on
-- those rows the `description` TYPES the tag as a ROLE ("Cute animal role",
-- "Toy-like role") while the published summary asserts the tag names an animal,
-- an object or a historical institution. It repaired nine such rows.
--
-- It also SPLIT the remaining deferral, and this file exists because that split
-- was drawn in the wrong place.
--
-- Round nine kept `angel`, `acolyte`, `butler`, `bimbo`, `catgirl` and
-- `bootblack` deferred on the ground that their summaries are "NARROW rather
-- than a different subject -- an angel IS a supernatural entity, a butler IS a
-- domestic worker". That test asks whether the REFERENT is correctly named.
-- Reading the whole role-typed cohort at once -- 27 rows, selected mechanically
-- as `description ~* '(role|persona)'` over the surviving set, rather than the
-- 19 round nine happened to look at -- shows the test tracks nothing a reader
-- cares about:
--
--     lamb    description "Innocent sheep role"  summary "Young sheep or sheep meat"
--     butler  description "Service role"          summary "Domestic worker in a large household"
--
-- Both name their referent correctly. Neither tells a reader of a kink glossary
-- that the tag names a role a person takes. The distinction between a creature
-- and an occupation is a fact about the referent, not about whether the page
-- works. The test that does work is the one round nine's own group A used:
-- DOES THE SUMMARY SAY THIS IS A ROLE? Under it, `angel`, `acolyte` and
-- `butler` fail exactly as `bunny` did, and they are repaired here.
--
-- So this is round nine's finding applied to its own leftovers: a deferral is a
-- claim about the data and decays like any other, and that holds for a deferral
-- made three hours ago by the pass that coined the rule. What is NEW here is not
-- a re-reading of the same rows -- it is the wider cohort, which is what makes
-- the old split visible as arbitrary.
--
-- THE RULE IS UNCHANGED, and it is the only thing licensing any of this: repair
-- only where the row's own `description` establishes a sense the summary
-- contradicts, derive the new summary FROM that description, and NEVER write
-- `description` -- it is the evidence that justifies the repair.
--
-- Corroboration that the kink-role reading is the right one, measured rather
-- than assumed: all 20 rows are `is_adult = true` and `human_reviewed = true`,
-- and every one sits in `Dynamics & Roles`. A zoology entry does not get filed
-- adult.
--
-- Three rows are worth naming individually.
--
--   `catgirl`'s body closes "The concept of catgirls is not related to any
--   real-world culture or identity" -- on a row whose own description says it is
--   a role people take, the prose denies the tag's subject outright.
--
--   `pet`'s body is not even encyclopedia, it is a TAG-ADMIN NOTE addressed to
--   nobody: "This tag is for discussions and information related to pets and
--   animals in the context of LGBTQ+ travel... The tag is intended to provide a
--   space for community members to share and find information about pets and
--   animals." Round nine deferred `pet` because it looked like two senses at
--   once (the pet-play role against pet-friendly travel). That is settled by
--   measurement rather than judgement: `pet` has ZERO live rows in
--   `unified_tag_assignments`, so there is no travel usage to protect.
--
--   `guru` is the plain namesake shape and the only one in this seam: summary
--   "American rapper and term for mentor or guide" -- Guru of Gang Starr -- over
--   a description that is a full BDSM mentor-role definition.
--
-- BODIES: 17 are NULLED, not replaced. Each is pure literal-referent
-- encyclopedia (family Anatidae, genus Panthera, "the meat of sheep", "endemic
-- to China", "the 2022 video game Acolyte", "also used as a family name") and
-- each row's description is a single line -- enough to state what the tag is,
-- not enough to write a body from. Minting one would be the guess this whole
-- class came from; this is the doe/fae/flock treatment of 60000301100100 and the
-- bunny/doll/meerkat treatment of 65000101100000. `beast`, `guru` and `pharaoh`
-- already carry no body and are not touched on that column.
--
-- Nulling is ASSERTED safe rather than assumed: `enforce_tag_thin_page_gate`
-- reads `tag_has_prose(description, short_description)` only, and all 20 rows
-- keep both. `long_description` is absent from `trg_search_documents_tag`'s
-- column list, so the body writes cause no search churn; the summary writes do
-- reindex, which is correct -- the summary IS the search facet and is the lead
-- line on /tags/:slug.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING on this tranche, verified live rather
-- than assumed: all 20 rows are `human_reviewed`, and an undeclared UPDATE
-- returns `human_reviewed tag <uuid> cannot be modified by system:trigger` from
-- log_unified_tag_change(). Round four's tranche was the opposite case, which is
-- why every file in this series states which one it is in.
--
-- DEFERRED, each with the reason it cannot be reached rather than a blanket
-- label:
--   * `wolf` ("Pack animal"), `knight` ("Chivalrous warrior"), `reynard`,
--     `familiar` ("Magical companion"), `satyress`, `goblin`, `villain` -- the
--     description is ITSELF the generic sense, so there is no contradiction on
--     the row and nothing to derive from. Round nine's deferral was right about
--     exactly these.
--   * `parent` ("Caregiver or progenitor of an offspring"), `event-organizer`
--     ("Plans and executes events"), `pillow-prince` ("A slang term for a
--     bottom") -- the summary describes a kind of PERSON and is correct as far
--     as it goes. Under-reaching is the correct error.
--   * `diva` ("Prima donna role" against "Celebrated woman of outstanding
--     talent") -- a replacement derivable from that description and the tag's
--     own name would define the term with the term, which is the defect this
--     backlog keeps finding. Not repairable under the rule.
--   * `bimbo` ("Stereotypically feminine role" against "Slang term for a
--     stereotypical attractive, sexualized woman") -- the defect here is
--     GENDERING, not subject: the summary writes every non-woman out of a role
--     page. That is the `femme` / `man` / `drag-show` class of 60000301100000
--     and 51500101160000, and it belongs in a pass with its siblings rather than
--     borrowing this file's licence.
--   * `bootblack` -- a leather-community role against "Person who cleans and
--     polishes shoes". Arguably this seam, but the community role and the trade
--     are genuinely two things and choosing between them is the guess this class
--     came from.
--
-- Postconditions test for the WRONG text, not for this file's own wording, so a
-- better repair written by a concurrent session also satisfies them. That shape
-- is what let 18 of 34 rows be cut from 60000301100000/100100 and two more from
-- 64000101100000 without any of those files raising on `main`, where a `db push`
-- abort takes every migration queued behind it.

select set_config('app.actor', 'admin:tag-prose-role-typed-completion', true);

-- ---------------------------------------------------------------------------
-- GROUP A1 -- a one-line description types the tag as a role; the summary
-- publishes the literal referent. The replacement says only what the
-- description already says (this is a role) plus which animal, being or
-- relationship the persona is named for, which comes from the tag's own name.
-- No scene detail is invented. Bodies are literal-referent encyclopedia and are
-- nulled.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'A role built on a wild animal or creature persona.'
 where slug = 'beast' and short_description = 'Mythical or fictional creature';

update public.unified_tags
   set short_description = 'A pet-play role built on a cat persona, in its masculine form.',
       long_description  = null
 where slug = 'catboy' and short_description = 'Cat with human-like traits';

update public.unified_tags
   set short_description = 'A pet-play role built on a cat persona, in its feminine form.',
       long_description  = null
 where slug = 'catgirl' and short_description = 'Feline-human hybrid character';

update public.unified_tags
   set short_description = 'A role built on an extended-family relationship.',
       long_description  = null
 where slug = 'cousin' and short_description = 'Child of a parent''s sibling';

update public.unified_tags
   set short_description = 'A role built on a dragon persona.',
       long_description  = null
 where slug = 'dragon' and short_description = 'Mythical creature in folklore';

update public.unified_tags
   set short_description = 'A pet-play role built on a duck persona.',
       long_description  = null
 where slug = 'duck' and short_description = 'Waterfowl in the family Anatidae';

update public.unified_tags
   set short_description = 'A role built on a wild, undomesticated animal persona.',
       long_description  = null
 where slug = 'feral' and short_description = 'Relating to domesticated species living in the wild';

update public.unified_tags
   set short_description = 'A role built on a lamb persona, cast as innocent.',
       long_description  = null
 where slug = 'lamb' and short_description = 'Young sheep or sheep meat';

update public.unified_tags
   set short_description = 'A role built on a panda persona.',
       long_description  = null
 where slug = 'panda' and short_description = 'Bear species native to China';

update public.unified_tags
   set short_description = 'A role built on a tiger persona.',
       long_description  = null
 where slug = 'tiger' and short_description = 'Large cat native to Asia';

update public.unified_tags
   set short_description = 'A role in which one partner takes on an animal-companion persona.',
       long_description  = null
 where slug = 'pet' and short_description = 'Pets and animals';

update public.unified_tags
   set short_description = 'A role built on an angel persona.',
       long_description  = null
 where slug = 'angel' and short_description = 'Spiritual or supernatural entity';

update public.unified_tags
   set short_description = 'A role built on a religious or spiritual follower persona.',
       long_description  = null
 where slug = 'acolyte' and short_description = 'Assistant in religious services';

update public.unified_tags
   set short_description = 'A service role built on a butler persona.',
       long_description  = null
 where slug = 'butler' and short_description = 'Domestic worker in a large household';

-- ---------------------------------------------------------------------------
-- GROUP A2 -- the description is already a full definition of the role, so the
-- replacement restates the row's own description and nothing else. `huntress`
-- additionally carries a body about killing wildlife, which is nulled; `guru`
-- and `pharaoh` carry no body at all.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'A dominant mentor role centred on teaching, ritual and guidance.'
 where slug = 'guru' and short_description = 'American rapper and term for mentor or guide';

update public.unified_tags
   set short_description = 'A dominant role built on the authority of an ancient Egyptian ruler.'
 where slug = 'pharaoh' and short_description = 'Term for ancient Egyptian monarchs';

update public.unified_tags
   set short_description = 'A role in which someone seeks out, chases or tracks another person in play.',
       long_description  = null
 where slug = 'huntress' and short_description = 'Person who hunts wildlife or feral animals';

-- ---------------------------------------------------------------------------
-- GROUP A3 -- the summary is NULL and the literal-referent BODY is what a
-- reader meets. Filling a NULL summary from the row's own description is not
-- the LLM rewrite both auto-apply paths were retired for -- nothing is
-- destroyed, and the UPDATE is guarded on the summary still being empty.
-- ---------------------------------------------------------------------------

update public.unified_tags
   set short_description = 'A role built on a frog persona.',
       long_description  = null
 where slug = 'frog' and coalesce(short_description, '') = ''
   and long_description like 'Frogs are a diverse and largely semiaquatic group%';

update public.unified_tags
   set short_description = 'A role built on a goat persona.',
       long_description  = null
 where slug = 'goat' and coalesce(short_description, '') = ''
   and long_description like 'The domestic goat is a species of goat-antelope%';

update public.unified_tags
   set short_description = 'A role built on a strawberry persona.',
       long_description  = null
 where slug = 'strawberry' and coalesce(short_description, '') = ''
   and long_description like 'Fragaria is a genus of flowering plants%';

-- ---------------------------------------------------------------------------
-- Postconditions.
-- ---------------------------------------------------------------------------

do $verify$
declare
  v_bad int;
begin
  -- 1. None of the twenty wrong summaries survives anywhere in the corpus.
  select count(*) into v_bad
    from public.unified_tags
   where short_description in (
           'Mythical or fictional creature',
           'Cat with human-like traits',
           'Feline-human hybrid character',
           'Child of a parent''s sibling',
           'Mythical creature in folklore',
           'Waterfowl in the family Anatidae',
           'Relating to domesticated species living in the wild',
           'Young sheep or sheep meat',
           'Bear species native to China',
           'Large cat native to Asia',
           'Pets and animals',
           'Spiritual or supernatural entity',
           'Assistant in religious services',
           'Domestic worker in a large household',
           'American rapper and term for mentor or guide',
           'Term for ancient Egyptian monarchs',
           'Person who hunts wildlife or feral animals'
         );
  if v_bad <> 0 then
    raise exception 'role-typed seam: % row(s) still publish a literal-referent summary', v_bad;
  end if;

  -- 2. The reached state, counted POSITIVELY. Counting rows in a BAD state
  --    returns a reassuring zero for a slug that has gone missing from the
  --    corpus entirely, which is exactly what the soft guards above allow.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('beast','catboy','catgirl','cousin','dragon','duck','feral','lamb','panda',
                  'tiger','pet','angel','acolyte','butler','guru','pharaoh','huntress',
                  'frog','goat','strawberry')
     and short_description is not null
     and short_description <> ''
     and short_description ~* '(^|[^a-z])role([^a-z]|$)';
  if v_bad <> 20 then
    raise exception 'role-typed seam: expected 20 rows carrying a role-typed summary, found %', v_bad;
  end if;

  -- 3. Thin-page gate: enforce_tag_thin_page_gate reads
  --    tag_has_prose(description, short_description) only, so every row must
  --    keep BOTH. This is what makes nulling a body safe.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('beast','catboy','catgirl','cousin','dragon','duck','feral','lamb','panda',
                  'tiger','pet','angel','acolyte','butler','guru','pharaoh','huntress',
                  'frog','goat','strawberry')
     and (coalesce(description, '') = '' or coalesce(short_description, '') = '');
  if v_bad <> 0 then
    raise exception 'role-typed seam: % row(s) would fail the thin-page gate', v_bad;
  end if;

  -- 4. The seventeen literal-referent bodies are gone.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('catboy','catgirl','cousin','dragon','duck','feral','lamb','panda','tiger',
                  'pet','angel','acolyte','butler','huntress','frog','goat','strawberry')
     and long_description is not null;
  if v_bad <> 0 then
    raise exception 'role-typed seam: % literal-referent body/bodies survive', v_bad;
  end if;

  -- 5. The mirror assertion. Nulling a correct body is the exact mirror of
  --    leaving a wrong one, so two rows in the same surviving backlog that carry
  --    real hand-written bodies must be untouched by this pass. Without this the
  --    file's own "bodies are gone" check is satisfied by a sweep that took
  --    everything.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('aftercare','chosen-family')
     and coalesce(long_description, '') = '';
  if v_bad <> 0 then
    raise exception 'role-typed seam: % control row(s) lost a correct body', v_bad;
  end if;
end $verify$;
