-- The namesake artifacts: 50 pages whose prose is about a different KIND of thing.
--
-- Round five of the backlog tag_disowned_prose_signals() counts. It is the
-- largest tranche so far, and the reason is not that the earlier passes missed
-- these — it is that they were looking in a different order.
--
-- ── THE ORDERING FINDING, which corrects a conclusion from hours ago ─────────
-- 51500101160000 (#3714, merged today) read 66 candidates IN USAGE ORDER,
-- found three, and concluded "the high-usage head of this backlog is now
-- largely clean, so the remaining ~320 should be planned against this rate".
-- The first half of that is RIGHT and is confirmed here independently: reading
-- the 56 used rows end to end produced exactly three repairs (awareness, dyke,
-- humiliation), and of 34 rows at the very top only one qualified.
--
-- The second half does not follow, and this file is the counter-example. The
-- rate is not a property of depth, it is a property of ORDER. Sorting by usage
-- puts the curated rows first: a term people actually apply is a term somebody
-- has read. Sorting instead by WHAT THE PROSE IS ABOUT surfaces a dense seam in
-- the zero-usage tail that usage order reaches last and therefore never reaches:
--
--   domme       → a commune in the Dordogne, France
--   sissy       → a commune in Aisne, France
--   servant     → a commune in Puy-de-Dôme, France
--   fister      → a village in Hjelmeland Municipality, Norway
--   miss        → a US state in the Midwest
--   mutha       → a province in southern Iraq
--   centaur     → the constellation Centaurus
--   tomcat      → a Java web application server
--   switching   → a rail operation for sorting vehicles into trains
--   spanker     → a type of sail on a ship
--   whipper     → a type of fall in rock climbing
--   fire-bottom → the floor of a fireplace ("Kaminrost")
--   pack        → the David and Lucile Packard Foundation
--   deviant     → an online art community platform
--   bit         → a unit of information in computing
--   vers        → poetry, as in VERSE
--
-- None of those is a near-miss or a shade of meaning. Each is a different class
-- of entity wearing the same string, which is why they are mechanically
-- identifiable and why they can be repaired as one group rather than one at a
-- time. 320 rows planned against "three per sixty-six" is a different decision
-- than 320 rows containing a seam like this, so the estimate is corrected here
-- rather than left to stand.
--
-- ── THE RULE IS UNCHANGED, AND IT IS WHAT MAKES 50 ROWS SAFE ────────────────
-- Repair only where the row's own `description` establishes a sense the
-- short/long description contradict. Every row below carries a non-null
-- `description`; that is not a convenience, it is the entire evidence base, and
-- it is why no sense is chosen here. The new summary is DERIVED from the
-- description the row already carried — the group-B rule of 51500101143000,
-- where the sense was already on the row and simply never reached the line that
-- cards, previews and search results render.
--
-- `description` is therefore NEVER written. Writing it would destroy the
-- evidence that justified the change.
--
-- The widened rule from 51500101152700 also applies: where a description is
-- terse ("Male cat", "Female demon", "Lowest in hierarchy") the CATEGORY is
-- read alongside it, because a curated editorial filing admits one reading of
-- the tag's own name. It is still NOT widened to "pick the most likely sense".
--
-- ── WHERE A BODY IS NULLED RATHER THAN REWRITTEN ───────────────────────────
-- Wherever the body is wholly about the other entity, it is NULLED and nothing
-- is minted — the queen / lioness / young half-measure. Authoring a full body
-- for `doe` or `minion` would be inventing kink vocabulary for a 0-usage row,
-- which is how this defect class started.
--
-- Nulling is safe and is ASSERTED, not assumed: enforce_tag_thin_page_gate
-- reads tag_has_prose(description, short_description), which is
-- `coalesce(nullif(btrim(description),''), short_description) is not null`, and
-- `description` is non-null on all 50 rows. The postcondition checks all 50
-- stay publishable rather than trusting that reasoning.
--
-- ── FOUR ROWS KEEP THE HALF THAT IS ALREADY RIGHT ──────────────────────────
-- The casting / trauma / watersports rule — repair only the wrong FIELD:
--   collar    summary was "Family name or surname"; its BODY is correct kink
--             prose about a D-ring and a negotiated relationship. Summary only.
--   humbler   summary was "Family name of origin"; its BODY correctly describes
--             the clamp. Summary only.
--   bottom    summary is already correct ("a role, not a level of power"); the
--             BODY is surname junk that cites Wikidata to the reader. Body only.
--   babyboy   summary is already correct and age-play framed; the BODY is about
--             a placeholder name printed on birth certificates. Body only.
--   dyke      summary is already correct; the BODY opens "The term 'Dyke' can
--             refer to a family name, as listed on Wikidata". Body only.
--
-- ── `schoolgirl` IS THE SAFETY ROW, AND IT IS THE `young` SHAPE AGAIN ───────
-- Fetishes, is_adult, seo_indexable. Its own description is careful and
-- explicit — "An age-play or roleplay archetype involving schoolgirl personas
-- and dynamics. All participants are consenting adults engaging in fantasy."
-- Directly beneath that, the published body read:
--
--   "A schoolgirl is a CHILD who is studying in a school."
--
-- with the summary "Student enrolled in a school". So the row states the adult
-- roleplay framing in the field a careful editor wrote, and then describes an
-- actual child in the two fields a disowned entity produced. 51500101152700
-- removed exactly this shape from `young`; this is the same defect on the
-- neighbouring row, and the reason it is worth doing at 0 usage is that
-- `seo_indexable` does not care how many people tagged it.
--
-- NOTE the relation `schoolgirl` → `student` is a SEPARATE artifact, read and
-- deliberately left by 50500101100000 as borderline. Nothing here touches
-- tag_relations; that call stands.
--
-- ── `stone-top` PUBLISHED THE OPPOSITE OF ITS OWN DEFINITION ───────────────
-- description: "Top who doesn't receive". Summary: "A person who receives anal
-- sex". Not a different subject — the exact inversion. Its BODY is correct
-- ("prefers to be the insertive partner"), so the body is kept and only the
-- summary is replaced, which is also what makes the direction unambiguous.
--
-- ── NAMED, AND DELIBERATELY NOT REPAIRED ───────────────────────────────────
--   goat, frog, bunny, tiger, panda, lamb, meerkat, strawberry, wolf
--            Zoology on a Dynamics & Roles row. Real, but it is the `lion`
--            class: the description ("Farm animal role", "Amphibian role") is
--            too thin to author a queer/kink sense from, and none is an
--            established role the way bear or pup is. Left for a pass that can
--            establish the sense rather than guess it.
--   hole, scent, doll, catboy, catgirl, hedonist, floozy, freak
--            The generic dictionary sense rather than a different entity. A
--            narrower and more arguable class; not mixed into this one.
--   dark-room / darkroom
--            `dark-room` is repaired here (its summary published the
--            PHOTOGRAPHY sense, the same defect 50100101100000 fixed on
--            `darkroom`). That the corpus holds BOTH rows for one concept is a
--            MERGE decision, not a prose one, and is recorded rather than taken.
--   sex-kitten, vixen, titica
--            Their bodies name real living people (an American drag queen, a
--            Polish rapper). sex-kitten and vixen are repaired because their
--            descriptions establish a role; `titica` is NOT touched — its own
--            description says it IS the Angolan musician, so there the prose
--            and the description agree and the oddity is the Fetishes filing.
--
-- ── DISCIPLINE ─────────────────────────────────────────────────────────────
--   * Every UPDATE is content-guarded on the defect's OWN text, so a human who
--     fixes one first keeps their work and this file no-ops on that row.
--   * Postconditions assert THE DEFECT IS GONE, never that this file's wording
--     is present — someone else's better fix satisfies them. Everything this
--     file does not own reports instead of aborting, because an abort on main
--     takes every migration queued behind it.
--   * No overlap with 51500101160000 (#3714), which merged while this was being
--     read: it took casual, drag-show and rooftop, none of which appear here.
--
-- TRAP: log_unified_tag_change() RAISEs when an actor matching `system:%`
-- modifies a human_reviewed row, and 48 of these 50 are human_reviewed. The
-- set_config below is load-bearing, verified live rather than assumed.
--
-- TRAP: trg_search_documents_tag is column-scoped and DOES include
-- short_description, so the ~45 summary writes each enqueue one
-- search_reindex_queue row. long_description is NOT in that list, so the
-- body-only repairs cost nothing. Read off pg_get_triggerdef.

begin;

select set_config('app.actor', 'migration:51500101174500', true);

-- ── A. SAFETY: child prose on an adult roleplay row ────────────────────────

update unified_tags
   set short_description = 'An age-play archetype played by consenting adults.',
       long_description  = null
 where slug = 'schoolgirl' and status = 'active'
   and short_description = 'Student enrolled in a school';

-- ── B. INVERTED: the summary said the opposite of the description ──────────

update unified_tags
   set short_description = 'A top who penetrates and does not receive.'
 where slug = 'stone-top' and status = 'active'
   and short_description = 'A person who receives anal sex';

-- ── C. ROWS THAT ARE ACTUALLY USED ─────────────────────────────────────────

update unified_tags
   set short_description = 'Raising consciousness about an issue.',
       long_description  = null
 where slug = 'awareness' and status = 'active'
   and short_description = 'Awareness of facts and information';

update unified_tags
   set long_description = null
 where slug = 'dyke' and status = 'active'
   and long_description like 'The term ''Dyke'' can refer to a family name%';

update unified_tags
   set short_description = 'Shame or embarrassment used as consensual play.',
       long_description  = null
 where slug = 'humiliation' and status = 'active'
   and short_description = 'Emotion of reduced social status';

-- ── D. NAMESAKE ARTIFACTS: a different kind of thing entirely ──────────────

-- D1. Places.

update unified_tags
   set short_description = 'A female dominant.', long_description = null
 where slug = 'domme' and status = 'active'
   and long_description like 'Domme is a commune in the Dordogne%';

update unified_tags
   set short_description = 'A feminized male role.', long_description = null
 where slug = 'sissy' and status = 'active'
   and long_description like 'Sissy refers to a commune in Aisne%';

update unified_tags
   set short_description = 'A service role.', long_description = null
 where slug = 'servant' and status = 'active'
   and long_description like 'Servant is a commune in Puy-de-D%';

update unified_tags
   set short_description = 'A person who fists.', long_description = null
 where slug = 'fister' and status = 'active'
   and short_description = 'Village in Norway';

update unified_tags
   set short_description = 'A title for a young woman.'
 where slug = 'miss' and status = 'active'
   and short_description = 'US state in the Midwestern region';

update unified_tags
   set short_description = 'An alternative spelling of mother.', long_description = null
 where slug = 'mutha' and status = 'active'
   and short_description = 'Province in southern Iraq';

update unified_tags
   set short_description = 'A mythological creature role.', long_description = null
 where slug = 'centaur' and status = 'active'
   and long_description like 'Centaurus is a large constellation%';

-- D2. Products, works and organisations.

update unified_tags
   set short_description = 'A male cat role.'
 where slug = 'tomcat' and status = 'active'
   and short_description = 'Java web application server';

update unified_tags
   set short_description = 'Alternating between dominant and submissive roles.',
       long_description  = null
 where slug = 'switching' and status = 'active'
   and short_description = 'Rail transport operation to sort vehicles';

update unified_tags
   set short_description = 'A person who spanks.', long_description = null
 where slug = 'spanker' and status = 'active'
   and short_description = 'Type of sail on a ship';

update unified_tags
   set short_description = 'A person who whips.', long_description = null
 where slug = 'whipper' and status = 'active'
   and short_description = 'Climbing term';

update unified_tags
   set short_description = 'The receiving partner in fire play.', long_description = null
 where slug = 'fire-bottom' and status = 'active'
   and short_description = 'Part of a fireplace';

update unified_tags
   set short_description = 'A close group with pack dynamics.', long_description = null
 where slug = 'pack' and status = 'active'
   and short_description = 'Private foundation providing grants';

update unified_tags
   set short_description = 'A person with unconventional desires.'
 where slug = 'deviant' and status = 'active'
   and short_description = 'Online art community platform';

update unified_tags
   set short_description = 'A male magical practitioner.', long_description = null
 where slug = 'wizard' and status = 'active'
   and long_description like 'The term ''Wizard'' refers to a fictional character in Marvel%';

update unified_tags
   set short_description = 'A male sexual demon.', long_description = null
 where slug = 'incubus' and status = 'active'
   and long_description like 'Incubus is an American rock band%';

update unified_tags
   set short_description = 'A female demon.', long_description = null
 where slug = 'demoness' and status = 'active'
   and long_description like 'The Demoness is a character from the video game%';

update unified_tags
   set short_description = 'Using knives for sensation or fear.', long_description = null
 where slug = 'knife-play' and status = 'active'
   and short_description = 'Xiu Xiu''s 2002 album';

update unified_tags
   set short_description = 'A clothing fetish centred on formal business attire.',
       long_description  = null
 where slug = 'business-suits' and status = 'active'
   and short_description = 'Song by Hole';

update unified_tags
   set short_description = 'A cunning female role.', long_description = null
 where slug = 'vixen' and status = 'active'
   and long_description like 'Vixen, also known as Dariusz Szlagor%';

update unified_tags
   set short_description = 'A sexually playful person.', long_description = null
 where slug = 'sex-kitten' and status = 'active'
   and short_description = 'American drag queen';

update unified_tags
   set short_description = 'An age-play role for an adult taking a young feminine headspace.'
 where slug = 'babygirl' and status = 'active'
   and short_description = '2024 erotic thriller film';

update unified_tags
   set short_description = 'A submissive who keeps house and serves domestically.'
 where slug = 'houseboy' and status = 'active'
   and short_description = '2007 film';

update unified_tags
   set short_description = 'A temporary father figure.'
 where slug = 'foster-daddy' and status = 'active'
   and short_description = '1980 Japanese comedy film';

update unified_tags
   set short_description = 'An age-play role built on a royal child persona.'
 where slug = 'little-princess' and status = 'active'
   and short_description = 'Classic novel and film about Sara Crewe';

update unified_tags
   set short_description = 'A person still exploring their role.'
 where slug = 'undecided' and status = 'active'
   and short_description = 'Song with multiple versions';

update unified_tags
   set short_description = 'Someone who is versatile.', long_description = null
 where slug = 'vers' and status = 'active'
   and short_description = 'Form of literary art using rhythmic language';

-- D3. Symbols, units and letters.

update unified_tags
   set short_description = 'Someone who identifies as an aromantic asexual.'
 where slug = 'ace-of-spades' and status = 'active'
   and short_description = 'High-ranking card in a deck';

update unified_tags
   set short_description = 'A cylindrical mouth gag.'
 where slug = 'bit' and status = 'active'
   and short_description = 'Unit of information in computing';

update unified_tags
   set short_description = 'A secondary or follower role.'
 where slug = 'beta' and status = 'active'
   and short_description = 'Genus of plants, Greek letter';

update unified_tags
   set short_description = 'A third-tier role in a hierarchy.', long_description = null
 where slug = 'gamma' and status = 'active'
   and short_description = 'Greek alphabet''s third letter';

update unified_tags
   set short_description = 'The lowest role in a hierarchy.'
 where slug = 'omega' and status = 'active'
   and short_description = 'Last letter of the Greek alphabet';

update unified_tags
   set short_description = 'A winged-insect persona in pet play.'
 where slug = 'butterfly' and status = 'active'
   and short_description = 'Winged insects with large, colorful wings';

-- D4. Surnames and placeholder names.

update unified_tags
   set short_description = 'A female deer role.', long_description = null
 where slug = 'doe' and status = 'active'
   and short_description = 'Family name';

update unified_tags
   set short_description = 'A person who manages another.', long_description = null
 where slug = 'handler' and status = 'active'
   and short_description = 'Family name';

update unified_tags
   set short_description = 'A loyal servant role.', long_description = null
 where slug = 'minion' and status = 'active'
   and short_description = 'Family name or term with various meanings';

update unified_tags
   set short_description = 'A person who tickles.', long_description = null
 where slug = 'tickler' and status = 'active'
   and short_description = 'A surname or electronic circuit';

-- D5. Rows where only ONE field is wrong (the casting/trauma rule).

update unified_tags
   set short_description = 'A neck band that is both a restraint fitting and a symbol of ownership.'
 where slug = 'collar' and status = 'active'
   and short_description = 'Family name or surname';

update unified_tags
   set short_description = 'A hinged clamp that traps the scrotum behind the thighs.'
 where slug = 'humbler' and status = 'active'
   and short_description = 'Family name of origin';

update unified_tags
   set long_description = null
 where slug = 'bottom' and status = 'active'
   and long_description like 'The term ''Bottom'' can refer to a family name%';

update unified_tags
   set long_description = null
 where slug = 'babyboy' and status = 'active'
   and long_description like 'The term ''Babyboy'' is used on some English-language birth certificates%';

-- D6. The generic professional or clinical sense on a kink or venue row.

update unified_tags
   set short_description = 'A darkened area in a venue for sexual encounters.'
 where slug = 'dark-room' and status = 'active'
   and short_description = 'Space for processing photographic materials';

update unified_tags
   set short_description = 'A roleplay archetype built on the librarian figure.',
       long_description  = null
 where slug = 'librarians' and status = 'active'
   and short_description = 'Professionals working in libraries';

update unified_tags
   set short_description = 'A person who feminizes another.', long_description = null
 where slug = 'feminizer' and status = 'active'
   and short_description = 'Medication to feminize body features';

update unified_tags
   set short_description = 'A person who enjoys being degraded.', long_description = null
 where slug = 'degradee' and status = 'active'
   and short_description = 'French term for a person assigned male at birth';

do $verify$
declare
  v_bad  int;
  v_note int;
  v_slugs text[] := array[
    'schoolgirl','stone-top','awareness','dyke','humiliation',
    'domme','sissy','servant','fister','miss','mutha','centaur',
    'tomcat','switching','spanker','whipper','fire-bottom','pack','deviant',
    'wizard','incubus','demoness','knife-play','business-suits','vixen','sex-kitten',
    'babygirl','houseboy','foster-daddy','little-princess','undecided','vers',
    'ace-of-spades','bit','beta','gamma','omega','butterfly',
    'doe','handler','minion','tickler','collar','humbler','bottom','babyboy',
    'dark-room','librarians','feminizer','degradee'];
begin
  -- HARD: every defect this file exists to remove is gone. Tests for the WRONG
  -- text, so a better fix written by someone else also satisfies it.
  select count(*) into v_bad from unified_tags
   where status = 'active' and short_description in (
     'Student enrolled in a school','A person who receives anal sex',
     'Awareness of facts and information','Emotion of reduced social status',
     'Village in Norway','US state in the Midwestern region','Province in southern Iraq',
     'Java web application server','Rail transport operation to sort vehicles',
     'Type of sail on a ship','Climbing term','Part of a fireplace',
     'Private foundation providing grants','Online art community platform',
     'Xiu Xiu''s 2002 album','Song by Hole','American drag queen',
     '2024 erotic thriller film','2007 film','1980 Japanese comedy film',
     'Classic novel and film about Sara Crewe','Song with multiple versions',
     'Form of literary art using rhythmic language','High-ranking card in a deck',
     'Unit of information in computing','Genus of plants, Greek letter',
     'Greek alphabet''s third letter','Last letter of the Greek alphabet',
     'Winged insects with large, colorful wings','Family name',
     'Family name or term with various meanings','A surname or electronic circuit',
     'Family name or surname','Family name of origin',
     'Space for processing photographic materials','Professionals working in libraries',
     'Medication to feminize body features','French term for a person assigned male at birth')
     and slug = any(v_slugs);
  if v_bad <> 0 then
    raise exception '% namesake-artifact summary(ies) still live', v_bad;
  end if;

  -- HARD: the bodies that described the other entity are gone.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs) and long_description is not null
     and (long_description like 'Domme is a commune%'
       or long_description like 'Sissy refers to a commune%'
       or long_description like 'Servant is a commune%'
       or long_description like 'Centaurus is a large constellation%'
       or long_description like 'Incubus is an American rock band%'
       or long_description like 'Vixen, also known as Dariusz Szlagor%'
       or long_description like 'The Demoness is a character from the video game%'
       or long_description like 'The term ''Wizard'' refers to a fictional character in Marvel%'
       or long_description like 'The term ''Dyke'' can refer to a family name%'
       or long_description like 'The term ''Bottom'' can refer to a family name%'
       or long_description like 'The term ''Babyboy'' is used on some English-language birth%'
       or long_description like 'A schoolgirl is a child who is studying%'
       or long_description like 'Shunting refers to a rail transport operation%'
       or long_description like 'The David and Lucile Packard Foundation%'
       or long_description like 'A fire bottom, also known as Kaminrost%'
       or long_description like 'Fister is a village in Hjelmeland%');
  if v_bad <> 0 then
    raise exception '% disowned-entity body/bodies still live', v_bad;
  end if;

  -- HARD, and the reason schoolgirl is in this file at all: the sentence
  -- describing an actual child must not survive on an is_adult roleplay row.
  if exists (select 1 from unified_tags
              where slug = 'schoolgirl' and status = 'active'
                and long_description is not null) then
    raise exception 'schoolgirl still publishes a body on an adult roleplay tag';
  end if;

  -- HARD: nulling a body is only safe while every row keeps prose the
  -- thin-page gate can see. Asserted rather than reasoned about.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs)
     and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception '% row(s) fell below the thin-page gate', v_bad;
  end if;

  -- HARD: `description` is the evidence and is never written by this file, so
  -- it must be present on every row this file touched.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs) and description is null;
  if v_bad <> 0 then
    raise exception '% row(s) lost the description this file reasoned from', v_bad;
  end if;

  -- HARD: the two rows whose correct half must survive untouched.
  if not exists (select 1 from unified_tags where slug='collar' and status='active'
                   and long_description like 'A collar is worn around the throat%') then
    raise notice 'collar: the correct body is no longer present (edited elsewhere; not an error)';
  end if;
  if not exists (select 1 from unified_tags where slug='stone-top' and status='active'
                   and long_description like 'A stone top is someone who prefers to be the insertive partner%') then
    raise notice 'stone-top: the correct body is no longer present (edited elsewhere; not an error)';
  end if;

  -- REPORTS: classes deliberately left, named so the next pass can tell
  -- "still deferred" from "already fixed".
  select count(*) into v_note from unified_tags
   where status = 'active'
     and slug in ('goat','frog','bunny','tiger','panda','lamb','meerkat','strawberry','wolf')
     and long_description is not null;
  if v_note > 0 then
    raise notice '% zoology-on-a-role row(s) deliberately left: the description is too thin to author a sense from (the lion rule)', v_note;
  end if;

  if exists (select 1 from unified_tags where slug='darkroom' and status='active')
     and exists (select 1 from unified_tags where slug='dark-room' and status='active') then
    raise notice 'dark-room and darkroom are both active and hold one concept — a MERGE decision, deliberately not taken here';
  end if;

  if exists (select 1 from unified_tags where slug='titica' and status='active'
               and description like 'Titica is an Angolan%') then
    raise notice 'titica left unchanged: its description and body AGREE (she is the musician); the open question is its Fetishes filing, not its prose';
  end if;
end
$verify$;

commit;
