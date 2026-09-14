-- The rope and consent glossary published prose about a different subject, and
-- the row's own `description` was right the whole time.
--
-- SOURCE: a comparison of the glossary against seven external rope/kink
-- glossaries (rebornropes.com A-Z, "A is for" and positions pages;
-- skillfullybound.com; fetbomb.com; naturallynaughty.shop Kinkipedia;
-- lioness.io). Not one word of prose below is copied from any of them — the
-- term lists were used only as a signal for where to look. What they surfaced
-- was not a gap.
--
-- THE DEFECT. On every row below, `unified_tags.description` is CORRECT and
-- `short_description` / `long_description` describe a different subject:
--
--   suspension       description: lifting a person off the ground with rope.
--                    long_description: "Suspension is an action taken by a
--                    website's administration to restrict or block a user's
--                    account." Active, seo_indexable, usage 3.
--   grounding        the kink/aftercare technique, published as the impact of
--                    a SHIP on the seabed.
--   redding-out      calling the red safeword, published as "a social event
--                    that provides a space for the LGBTQ+ community to gather".
--                    seo_indexable, on a safety term.
--   rope-eel         a bottom who escapes rope painfully, published as a fish
--                    of the family Moringuidae.
--   service-rigger   a rope top who ties in a spirit of service, published as
--                    a person who sets up lighting and sound for events.
--   domspace         a headspace, published as "a community or physical space".
--   rope-model       published as an invented "framework used to understand and
--                    communicate about sexual boundaries" — no such model.
--   harness          published as body armor (Q485027).
--   rope-bottom      published as a DRAWING in the National Gallery of Art
--                    (Q64555914, "Rope Bottom Chair", NGA 16762).
--   property         published as the legal system of property rights, on a
--                    Dynamics & Roles ownership term (Q937228 is a third sense
--                    again — "property" as an attribute in philosophy).
--   bondage          body ends "...can be found in various sources, including
--                    the 2014 edition of Wikidata and Wikipedia", citing its own
--                    source to the reader. Q61286643 is a bibliographic EDITION.
--   white-knight     long_description is correct (the 2026-09-05 prose pass
--                    fixed it) and short_description still reads "2011 American
--                    comedy film".
--   bottom           "Family name or surname", on the core kink role.
--   pincushion       "Small cushion for storing pins or needles", on the
--                    needle-play role.
--   fucktoy          "2025 American surrealist film".
--   dependency       "Detached secondary building of a residential complex".
--   nudist           describes a BEACH; a nudist is a person.
--   possum, babyboy, toy, bratty-bottom, bondage-tape, spotter,
--   after-scene-drop  same shape, milder.
--
-- WHICH FIELD THE READER SEES. src/pages/TagDetail.tsx renders `description`
-- as the lead paragraph and `long_description` as the body directly beneath it,
-- so /tags/suspension served a correct one-line definition of rope suspension
-- followed by four sentences about account bans. functions/_lib/detail.ts
-- selects all three columns, so crawlers got it too. short_description is the
-- meta description whenever `description` is empty.
--
-- MECHANISM, dated from tag_change_log rather than inferred. One enrichment
-- sweep on 2026-04-27 between 16:55 and 18:56 wrote every one of these: the
-- trigger set `wikidata_id` first, then the same sweep wrote the prose from
-- that entity 40-90 minutes later. Rows that never had a QID (rope-eel,
-- redding-out, service-rigger, domspace, rope-model, spotter) got prose from a
-- NAME-ONLY lookup, which is the namesake mechanism _shared/tag-wiki-guard.ts
-- was later built to seal at the producer.
--
-- WHY NO EXISTING DETECTOR FOUND IT. The 2026-08-29 wrong-entity repair
-- (20261008100000) classified by the P31 of the STORED QID. 3,179 of 4,727
-- active tags carry no QID at all, so it was structurally blind to them. And
-- for the two rows here it DID touch, it removed the identifier and left the
-- prose standing: `spotter` (Q122307053, a 2018 video game) on 2026-08-29, and
-- `suspension` on 2026-09-04 under a hand-written reason that diagnosed it
-- exactly right — "Rope suspension. The QID is an administrative account ban."
-- tag_change_log shows short_description unchanged across both writes. That is
-- the lesson 20360401100300 already recorded for `queerness`, on a third
-- entity class: NULLING THE IDENTIFIER DOES NOT UNPUBLISH THE PROSE IT MADE.
--
-- MEASURED RESIDUE, stated rather than implied away. 364 active tags still
-- carry the short_description that a now-disowned entity produced, 339 of them
-- seo_indexable. A hand-read sample of 24 came back 11 clearly wrong, 3
-- borderline, 10 fine — so roughly 45%, about 165 rows, and this migration
-- repairs only the 26 that were read. The rest is unexamined, not clean.
-- 50500101100200 adds the sentinel that keeps the number visible.
--
-- REPLACE, DO NOT RETRACT. Every row here is ACTIVE and rendering, so nulling
-- the column would leave a live page thinner instead of correct — the rule
-- 20361124161700 set for `methadone` and 50100101100000 for `darkroom`. Where
-- a full body is warranted it is written; otherwise `long_description` is
-- nulled and the correct `description` carries the page. That is safe: the
-- thin-page gate reads tag_has_prose(description, short_description) only, and
-- both stay populated, so no row is deindexed by this.
--
-- IDENTIFIERS ARE NULLED, NEVER REPOINTED. tag_medical_codes_sync and
-- tag_wikidata_hierarchy rebuild weekly from wikidata_id, so a
-- plausible-but-wrong QID regenerates wrong data forever while a null one
-- regenerates nothing.
--
-- EVERY UPDATE IS GUARDED ON THE DEFECT'S OWN SIGNATURE and no-ops otherwise,
-- so a row a human has since rewritten is never overwritten. The postcondition
-- at the end asserts the count rather than trusting it.
--
-- NOT DONE, measured rather than assumed:
--   steer    Fetishes, description "Castrated bull", sd "Family name or
--            navigation term". Both are wrong for a kink tag but the INTENDED
--            sense cannot be established from the row, so nothing is written.
--   warlord  same shape: Fetishes, description "Military leader".
--            Guessing a sense is how the wrong-sense class got here.
--   crotch-rope / breast-bondage carry the CORRECT Wikidata entity and prose
--            copied from its description, which is gendered upstream ("a
--            woman's waist", "the labia", "a woman's breasts"). That is a
--            separate correction with its own reasoning, done below, and the
--            QIDs are deliberately KEPT because they are right.

set local statement_timeout = '600s';

-- log_unified_tag_change() RAISEs when an undeclared `system:%` actor modifies
-- a human_reviewed row, and every row below is human_reviewed.
select set_config('app.actor', 'migration:rope-glossary-wrong-subject', true);

do $mig$
declare
  v_fixed int := 0;
  v_n     int;
begin
  ------------------------------------------------------------------ suspension
  -- The one row that earns a full body: it is the highest-usage rope term here
  -- and the practice with the most specific, most cited risks.
  update public.unified_tags set
    short_description =
      'Taking a person''s weight off the ground with rope — partial, with some contact remaining, or full.',
    long_description =
      'Suspension lifts some or all of a bound person''s weight off the ground. Partial suspension keeps a point of contact — a foot, a knee, a hip — and is where most people start; full suspension carries the whole body on the rope.

It is the highest-risk thing done with rope, and the risks are specific rather than general. Load concentrates on whatever the harness bears against, so a chest harness that is comfortable on the floor can compress the radial nerve once it is holding body weight: numbness, tingling or a loss of grip means the rope comes down immediately. Hanging still with the legs below the heart pools blood in them, which is why an unresponsive person is brought down rather than supported in place. The hard point, the rope and every connector carry the full dynamic load of a moving body, not its resting weight.

None of it is improvised. Safety shears stay within reach of the person tying, the bottom is asked for feedback continuously rather than at the end, and time in the air is planned before anyone leaves the ground.'
  where slug = 'suspension'
    and long_description like 'Suspension is an action taken by a website%';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  ------------------------------------------------------------------- grounding
  update public.unified_tags set
    wikidata_id   = null,
    wikipedia_url = null,
    short_description =
      'Techniques that bring someone back into their body and the present moment when a scene becomes overwhelming.',
    long_description = null
  where slug = 'grounding'
    and short_description = 'Ship impact on seabed or waterway side';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  ----------------------------------------------------------------- redding-out
  update public.unified_tags set
    short_description =
      'Calling the red safeword — stopping a scene immediately rather than adjusting it.',
    long_description = null
  where slug = 'redding-out'
    and short_description = 'Social event for LGBTQ+ community';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  -------------------------------------------------------------------- rope-eel
  update public.unified_tags set
    short_description =
      'A rope bottom who escapes by force, accepting that it may hurt them to do it.',
    long_description = null
  where slug = 'rope-eel'
    and short_description = 'Rope eel, a type of fish';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  -------------------------------------------------------------- service-rigger
  update public.unified_tags set
    short_description =
      'A rope top who ties in service of what the bottom wants, rather than to express control or a visual idea.',
    long_description = null
  where slug = 'service-rigger'
    and short_description = 'Person who sets up equipment';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  -------------------------------------------------------------------- domspace
  update public.unified_tags set
    short_description =
      'The focused, absorbed headspace a top can enter while running a scene — the counterpart to subspace.',
    long_description = null
  where slug = 'domspace'
    and short_description = 'Space for BDSM dominants';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  ------------------------------------------------------------------ rope-model
  update public.unified_tags set
    short_description =
      'Someone who is tied for photography or performance, where the image is the point of the tie.',
    long_description = null
  where slug = 'rope-model'
    and short_description = 'A model for understanding sexual boundaries';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  --------------------------------------------------------------------- harness
  update public.unified_tags set
    wikidata_id   = null,
    wikipedia_url = null,
    short_description =
      'A worn arrangement of straps or rope — for holding a toy, for restraint, or for how it looks.',
    long_description = null
  where slug = 'harness'
    and short_description = 'Protective clothing or armor worn on the body';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  ----------------------------------------------------------------- rope-bottom
  update public.unified_tags set
    wikidata_id   = null,
    wikipedia_url = null,
    short_description =
      'The person being tied — the active, negotiating half of a rope scene, not a passive one.',
    long_description = null
  where slug = 'rope-bottom'
    and short_description = 'Rope bottom in art';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  -------------------------------------------------------------------- property
  update public.unified_tags set
    wikidata_id   = null,
    wikipedia_url = null,
    short_description =
      'Being owned within a negotiated power exchange — a relationship someone consents to and can end.',
    long_description = null
  where slug = 'property'
    and short_description = 'Legal control of valuable things';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  --------------------------------------------------------------------- bondage
  -- description and short_description are already right; only the body, which
  -- cites Wikidata to the reader, and the bibliographic QID are wrong.
  update public.unified_tags set
    wikidata_id      = null,
    long_description = null
  where slug = 'bondage'
    and long_description like '%2014 edition of Wikidata%';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  ---------------------------------------------------- short_description only
  -- long_description on these is already correct, so only the summary moves.
  update public.unified_tags set
    short_description =
      'Someone who appoints themselves protector of a newcomer or a partner, usually without being asked.'
  where slug = 'white-knight' and short_description = '2011 American comedy film';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description =
      'The emotional and physical crash that can follow an intense scene, for tops as well as bottoms.'
  where slug = 'after-scene-drop' and short_description = 'Emotional low after social events';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description =
      'Someone watching a scene purely for safety, taking no part in it.'
  where slug = 'spotter' and short_description = 'Person who observes and reports';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  ---------------------------------------------------------------- bondage-tape
  update public.unified_tags set
    short_description =
      'Non-adhesive tape that clings only to itself, so it wraps and restrains without pulling skin or hair.',
    long_description = null
  where slug = 'bondage-tape' and short_description = 'A type of sex toy used in BDSM';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  ---------------------------------------------------- crotch-rope / breast-bondage
  -- Correct entity, gendered prose. Wikidata's own descriptions for Q5188969
  -- and Q3482254 are written as "a woman's waist ... the labia ... the female
  -- genitals" and "a woman's breasts", and the sweep copied them. Both ties are
  -- practised across bodies, and on this platform describing them as things
  -- done to women writes most of the audience out of their own glossary. The
  -- QIDs are KEPT: the entity is right, only the prose is narrow.
  update public.unified_tags set
    short_description =
      'A rope passed between the legs and tensioned against the crotch, tied off at the waist.',
    long_description =
      'Matanawa, the crotch rope, runs a line between the legs and anchors it to a rope around the waist, so that pressure can be adjusted by pulling on the waistline. Knots are sometimes added along the length to concentrate it. It is used on any body; what changes between people is where the rope sits and how much tension is bearable there.

It presses on soft tissue that does not tolerate sustained load well, and on genitals it can numb rather than stimulate if left tight. It is adjusted and released rather than set and forgotten.'
  where slug = 'crotch-rope'
    and short_description = 'Bondage technique applying pressure to female genitals';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description =
      'Rope wrapped above and below the chest, framing and compressing it.',
    long_description =
      'Breast bondage — shinju, "pearls", in Japanese rope — takes wraps above and below the chest and cinches them, so the chest is framed and compressed rather than bound to anything. It is decorative as often as it is restrictive, and it is the visible half of many chest harnesses.

The wraps sit where the brachial and radial nerves run toward the arm, so tingling, numbness or a weakening grip is a reason to release them rather than to adjust tension. It is tied on any chest; the rope does not care what shape it is working with.'
  where slug = 'breast-bondage'
    and short_description = 'Breast bondage is a rope tying technique';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  ------------------------------------------------- remaining read-and-proven rows
  update public.unified_tags set
    short_description = 'The person receiving in a scene — which is a role, not a level of power.'
  where slug = 'bottom' and short_description = 'Family name or surname';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description = 'A bottom who plays by resisting, teasing and testing, inside limits already agreed.',
    long_description  = null
  where slug = 'bratty-bottom' and short_description = '2024 video game';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description = 'Someone who takes needles in play piercing.'
  where slug = 'pincushion' and short_description = 'Small cushion for storing pins or needles';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description = 'Someone treated as a sexual object within a negotiated dynamic.',
    long_description  = null
  where slug = 'fucktoy' and short_description = '2025 American surrealist film';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description = 'Relying on another person for structure, decisions or care as part of a dynamic.',
    long_description  = null
  where slug = 'dependency'
    and short_description = 'Detached secondary building of a residential complex';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description = 'Someone who goes without clothes by preference — a person, not a place.'
  where slug = 'nudist' and short_description = 'Beach where nudity is allowed';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description = 'A pet-play persona built on the possum rather than a dog or a cat.'
  where slug = 'possum' and short_description = 'North America''s only marsupial';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description = 'An age-play role for an adult taking a young masculine headspace.'
  where slug = 'babyboy' and short_description = 'Term for a male child without a given name';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  update public.unified_tags set
    short_description = 'Someone used as an object of play within a negotiated dynamic.'
  where slug = 'toy' and short_description = 'Object used for entertainment';
  get diagnostics v_n = row_count; v_fixed := v_fixed + v_n;

  raise notice 'rope wrong-subject prose: % row(s) corrected', v_fixed;

  -- Postcondition. Not "some rows changed" — the specific condition this file
  -- exists to remove must be gone. Re-running is a no-op and still passes.
  select count(*) into v_n
    from public.unified_tags
   where (slug = 'suspension'       and long_description  like 'Suspension is an action taken by a website%')
      or (slug = 'grounding'        and short_description = 'Ship impact on seabed or waterway side')
      or (slug = 'redding-out'      and short_description = 'Social event for LGBTQ+ community')
      or (slug = 'rope-eel'         and short_description = 'Rope eel, a type of fish')
      or (slug = 'service-rigger'   and short_description = 'Person who sets up equipment')
      or (slug = 'domspace'         and short_description = 'Space for BDSM dominants')
      or (slug = 'rope-model'       and short_description = 'A model for understanding sexual boundaries')
      or (slug = 'harness'          and short_description = 'Protective clothing or armor worn on the body')
      or (slug = 'rope-bottom'      and short_description = 'Rope bottom in art')
      or (slug = 'property'         and short_description = 'Legal control of valuable things')
      or (slug = 'bondage'          and long_description  like '%2014 edition of Wikidata%')
      or (slug = 'white-knight'     and short_description = '2011 American comedy film')
      or (slug = 'bottom'           and short_description = 'Family name or surname')
      or (slug = 'pincushion'       and short_description = 'Small cushion for storing pins or needles')
      or (slug = 'fucktoy'          and short_description = '2025 American surrealist film')
      or (slug = 'nudist'           and short_description = 'Beach where nudity is allowed');
  if v_n > 0 then
    raise exception 'rope wrong-subject prose: % row(s) still carry the wrong subject', v_n;
  end if;

  -- The four wrong identifiers must be gone, or the weekly Wikidata syncs
  -- rebuild from them and this repair is undone on a schedule.
  select count(*) into v_n from public.unified_tags
   where (slug = 'harness'     and wikidata_id = 'Q485027')
      or (slug = 'rope-bottom' and wikidata_id = 'Q64555914')
      or (slug = 'property'    and wikidata_id = 'Q937228')
      or (slug = 'bondage'     and wikidata_id = 'Q61286643')
      or (slug = 'grounding'   and wikidata_id = 'Q14920473');
  if v_n > 0 then
    raise exception 'rope wrong-subject prose: % wrong identifier(s) survived', v_n;
  end if;

  -- Nothing may be deindexed by this migration. tag_has_prose reads
  -- description and short_description only, so nulling long_description is
  -- safe; assert that rather than trusting it.
  select count(*) into v_n from public.unified_tags
   where slug in ('suspension','redding-out','harness','rope-bottom','property','bondage',
                  'white-knight','bottom','pincushion','fucktoy','nudist','crotch-rope',
                  'breast-bondage','bondage-tape','bratty-bottom','possum','babyboy','toy',
                  'dependency','rope-model')
     and status = 'active'
     and not public.tag_has_prose(description, short_description);
  if v_n > 0 then
    raise exception 'rope wrong-subject prose: % row(s) lost their prose gate', v_n;
  end if;
end
$mig$;

-- Provenance. A corrected row records WHY it was overwritten, so the next
-- comparison does not re-derive it from scratch.
insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
select t.id, 'editorial:general-knowledge',
       'Wrong-subject prose repair, migration 50500101100000. The row''s own `description` was correct; '
       || 'short_description/long_description described a different subject, written by the 2026-04-27 '
       || 'enrichment sweep from a wrong or name-only Wikidata lookup. Prose replaced rather than retracted '
       || 'because the row is active and rendering. Wrong identifiers nulled, never repointed.',
       false
  from public.unified_tags t
 where t.slug in ('suspension','grounding','redding-out','rope-eel','service-rigger','domspace',
                  'rope-model','harness','rope-bottom','property','bondage','white-knight',
                  'after-scene-drop','spotter','bondage-tape','crotch-rope','breast-bondage',
                  'bottom','bratty-bottom','pincushion','fucktoy','dependency','nudist',
                  'possum','babyboy','toy')
   and not exists (select 1 from public.tag_sources s
                    where s.tag_id = t.id
                      and s.claim_summary like '%migration 50500101100000%');
