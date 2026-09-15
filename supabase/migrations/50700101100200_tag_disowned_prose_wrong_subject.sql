-- Glossary content: eight live pages whose own `description` is CORRECT and
-- whose short/long description describe a different subject.
--
-- `/tags/support` renders "The act of providing assistance, encouragement, and
-- resources to another person." as its lead paragraph and then 375 characters
-- about **canvas and paper** beneath it. `/tags/dating` renders "Exploring
-- romantic connection" and then 466 characters about dating **fossils**.
-- `/tags/romance` follows a definition of being in love with 430 characters
-- about the **film genre**. `TagDetail.tsx` renders `description` as the lead
-- and `long_description` as the body directly under it, and
-- `functions/_lib/detail.ts` selects all three columns, so crawlers get it too.
--
-- This is the class `50500101100000` (rope glossary) named and repaired 26 rows
-- of: `description` correct, short/long about something else. These eight are
-- the same defect from the same producer. All eight are ACTIVE and
-- `seo_indexable`, and the highest-usage one carries 10,377 assignments.
--
-- PROVENANCE. Every row sits in `tag_wikidata_repair_audit` with
-- `disposition='cleared'`: the 2026-08-29 wrong-entity repair took the
-- identifier away and, per its own rule, deliberately left the prose. The
-- entity each was written from is recorded there and is the giveaway --
-- `support` <- "painting support", `dating` <- "chronological dating"
-- (fossils), `romance` <- "romance film", `workshop` <- "studio", `bull` <-
-- "family name" then a cattle body, `news-pride` <- the EMOTION pride.
-- `tag_disowned_prose_signals()` has counted this backlog since
-- `50500101100300`; this migration works the top of it by hand.
--
-- THE SELECTION RULE, stated because it is what bounds the change: a row is
-- repaired ONLY where its own `description` establishes a sense that the
-- short/long description contradict. That is evidence on the row, not taste.
-- Rows whose intended sense CANNOT be established are deliberately left alone,
-- exactly as `50500101100000` left `steer` and `warlord`: guessing a sense is
-- how this whole class arose. Named so the next pass does not re-derive them:
--
--   lion    (Dynamics & Roles)  sd "Large cat species" + a zoology body, over a
--                               description of "King of beasts role" that is too
--                               thin to author from. A lion is not an
--                               established queer/kink role the way bear, otter
--                               or cub are, so writing one would mint vocabulary.
--   gym     (Venue Types)       sd is GYMNASTICS ("Sport with exercises for
--                               balance, strength, and flexibility") on a venue
--                               tag, but `description` is NULL, so a fix would
--                               be authoring the row's only prose.
--   office  (Work & Institutions) sd is "office" as in HOLDING office; the tag
--                               could mean either that or the workplace.
--   library (Community Life)    sd ends "or a work titled The Library", plainly
--                               artefactual, but `description` is NULL.
--   black, peaches, young       ordinary words whose intended sense on their
--                               category cannot be read off the row.
--
-- WHAT IS AND IS NOT REWRITTEN.
--   * `description` is NEVER touched. It is correct on all eight and is what
--     establishes the sense in the first place -- the `casting` / `trauma` /
--     `watersports` rule of repairing only the wrong FIELDS.
--   * Prose is REPLACED, never retracted. Every row is live and rendering, so
--     nulling leaves a correct-but-thinner page where a replacement leaves a
--     correct one (the `methadone` / `darkroom` / `aids` rule).
--   * `man` gets its `short_description` replaced and its `long_description`
--     LEFT ALONE. The body is already trans-inclusive and on-subject; only the
--     one-line "An adult human male." contradicts the row's own description
--     ("A masculine gender identity that may or may not align with male sex
--     assigned at birth"). Rewriting correct-but-wordy prose is the LLM rewrite
--     both auto-apply paths were retired for.
--   * `keeper` has a NULL `long_description`; only the one line is wrong.
--   * No identifier is touched: `wikidata_id` is already NULL on all eight,
--     cleared by the 2026-08-29 repair.
--
-- Every UPDATE is CONTENT-GUARDED on the defect's own text, so a human who
-- corrects one of these first keeps their work and this file no-ops. The prior
-- text survives in `tag_change_log.before_data`, which is why content writes go
-- through an attributed actor.
--
-- TRAP: `log_unified_tag_change()` RAISEs when an actor matching `system:%`
-- modifies a `human_reviewed` row, and `keeper`, `bull` and `man` are all
-- human_reviewed. The default actor is `system:trigger`, so without the
-- `set_config` below this migration aborts on those three.

begin;

select set_config('app.actor', 'migration:50700101100200', true);

-- news-pride (10,377 assignments) -- the EMOTION pride, on a news tag whose own
-- description is "Pride events and celebrations". long_description is empty.
update unified_tags
   set short_description = 'Pride marches, festivals and celebrations.'
 where slug = 'news-pride'
   and status = 'active'
   and short_description = 'Emotion of self-worth and accomplishment';

-- workshop -- an artist's STUDIO, over "Educational or skill-building sessions".
update unified_tags
   set short_description = 'A hands-on session where a group learns a skill together.',
       long_description  = 'A workshop is a session where a group learns a skill by practising it, usually led by someone experienced in it. Unlike a talk or a panel it is participatory and normally capped in size. Queer venues and community organisations run them on subjects ranging from sexual health and know-your-rights sessions to rope technique, drag craft and peer support.'
 where slug = 'workshop'
   and status = 'active'
   and short_description = 'Space for artists to work'
   and long_description like 'A workshop is a working place set aside for artists%';

-- support -- a painting SURFACE (canvas, paper), over a correct description of
-- assistance and encouragement.
update unified_tags
   set short_description = 'Practical and emotional help people give each other.',
       long_description  = 'Support covers the practical and emotional help people give each other: peer groups, helplines, counselling, mutual aid and the everyday work of showing up. For queer people a large share of it comes from outside the family of origin — chosen family, community organisations and peer networks carry it, particularly for those rejected at home or living somewhere formal services are hostile or absent.'
 where slug = 'support'
   and status = 'active'
   and short_description = 'Surface for painting or drawing'
   and long_description like 'A support is a material that forms the surface%';

-- dating -- CHRONOLOGICAL dating of fossils, over "Exploring romantic connection".
update unified_tags
   set short_description = 'Meeting people with romantic or sexual intent.',
       long_description  = 'Dating is the process of meeting people with romantic or sexual intent, whether it leads to a relationship, a casual connection or nothing at all. Queer dating carries specifics that straight dating does not: judging whether it is safe to be visible in a given place, reading whether someone is out, relying on apps as the main meeting point where there are few queer venues, and negotiating what a relationship should look like rather than inheriting a template.'
 where slug = 'dating'
   and status = 'active'
   and short_description = 'Attributing a date to an object or event'
   and long_description like 'Chronological dating is the process%';

-- romance -- the FILM GENRE, over "The state of being in love or infatuated".
update unified_tags
   set short_description = 'Romantic love and the feelings and gestures around it.',
       long_description  = 'Romance is romantic love and the attention paid to it — courtship, affection and the gestures people use to express attachment. It is distinct from sexual attraction, and the two do not always travel together: a person can want romance without sex, sex without romance, or neither. That distinction is the ground aromantic and asexual vocabulary maps.'
 where slug = 'romance'
   and status = 'active'
   and short_description = 'Films about romantic love and relationships'
   and long_description like 'Romance films involve romantic love stories%';

-- keeper -- a football GOALKEEPER, on a Fetishes row whose own description is
-- "Guardian or caretaker". long_description is already NULL.
update unified_tags
   set short_description = 'A role built on guarding and caring for someone.'
 where slug = 'keeper'
   and status = 'active'
   and short_description = 'Goalkeeper in various team sports';

-- bull -- CATTLE, beef ranching and bullfighting, on a Kink Community row whose
-- own description is "Dominant male in cuckold scenarios".
update unified_tags
   set short_description = 'The dominant third man in a cuckold dynamic.',
       long_description  = 'In a cuckold dynamic the bull is the third party who has sex with someone''s partner while that partner watches or knows about it. The role is defined by the arrangement rather than by any particular body or orientation.'
 where slug = 'bull'
   and status = 'active'
   and short_description = 'Adult male cattle'
   and long_description like 'A bull is an intact adult male of the species Bos taurus%';

-- man -- "An adult human male." is the essentialist one-liner, and it
-- contradicts this row's own description. The BODY is already trans-inclusive
-- and stays untouched.
update unified_tags
   set short_description = 'A masculine gender identity, held by trans and cis men alike.'
 where slug = 'man'
   and status = 'active'
   and short_description = 'An adult human male.';

do $verify$
declare
  v_bad int;
  v_desc_changed int;
begin
  -- Positive assertion of the REACHED state. Counting updated rows proves
  -- nothing on a re-run, because every statement above is content-guarded and
  -- legitimately no-ops once applied.
  select count(*) into v_bad
    from unified_tags
   where status = 'active'
     and (
       (slug = 'news-pride' and short_description <> 'Pride marches, festivals and celebrations.')
    or (slug = 'workshop'   and short_description <> 'A hands-on session where a group learns a skill together.')
    or (slug = 'support'    and short_description <> 'Practical and emotional help people give each other.')
    or (slug = 'dating'     and short_description <> 'Meeting people with romantic or sexual intent.')
    or (slug = 'romance'    and short_description <> 'Romantic love and the feelings and gestures around it.')
    or (slug = 'keeper'     and short_description <> 'A role built on guarding and caring for someone.')
    or (slug = 'bull'       and short_description <> 'The dominant third man in a cuckold dynamic.')
    or (slug = 'man'        and short_description <> 'A masculine gender identity, held by trans and cis men alike.')
     );
  if v_bad <> 0 then
    raise exception '% of the eight rows did not reach the corrected short_description', v_bad;
  end if;

  -- None of the wrong-subject bodies may survive.
  select count(*) into v_bad
    from unified_tags
   where status = 'active'
     and slug in ('workshop','support','dating','romance','bull')
     and (long_description like 'A workshop is a working place set aside for artists%'
       or long_description like 'A support is a material that forms the surface%'
       or long_description like 'Chronological dating is the process%'
       or long_description like 'Romance films involve romantic love stories%'
       or long_description like 'A bull is an intact adult male of the species Bos taurus%');
  if v_bad <> 0 then
    raise exception '% wrong-subject long_description(s) still live', v_bad;
  end if;

  -- `man` keeps its body: rewriting correct prose is the retired LLM rewrite.
  if not exists (
    select 1 from unified_tags
     where slug = 'man' and status = 'active'
       and long_description like 'A man is an adult human being who identifies as male%'
  ) then
    raise exception 'man.long_description was modified; it is correct and must be left alone';
  end if;

  -- `description` is the evidence for every repair above and must be intact.
  select count(*) into v_desc_changed
    from unified_tags
   where status = 'active'
     and ((slug = 'news-pride' and description is distinct from 'Pride events and celebrations')
       or (slug = 'workshop'   and description is distinct from 'Educational or skill-building sessions')
       or (slug = 'support'    and description is distinct from 'The act of providing assistance, encouragement, and resources to another person.')
       or (slug = 'dating'     and description is distinct from 'Exploring romantic connection')
       or (slug = 'romance'    and description is distinct from 'The state of being in love or infatuated with another person.')
       or (slug = 'keeper'     and description is distinct from 'Guardian or caretaker')
       or (slug = 'bull'       and description is distinct from 'Dominant male in cuckold scenarios')
       or (slug = 'man'        and description is distinct from 'A masculine gender identity that may or may not align with male sex assigned at birth.'));
  if v_desc_changed <> 0 then
    raise exception '% description(s) changed; this migration must only touch short/long', v_desc_changed;
  end if;

  -- The rows deliberately NOT touched must still be untouched, so a later pass
  -- can tell "left by decision" from "already fixed".
  if not exists (select 1 from unified_tags where slug='lion' and status='active'
                   and short_description = 'Large cat species') then
    raise exception 'lion was modified; its sense cannot be established from the row';
  end if;
  if not exists (select 1 from unified_tags where slug='gym' and status='active'
                   and short_description = 'Sport with exercises for balance, strength, and flexibility') then
    raise exception 'gym was modified; its description is NULL so a fix would be authoring';
  end if;
end
$verify$;

commit;
