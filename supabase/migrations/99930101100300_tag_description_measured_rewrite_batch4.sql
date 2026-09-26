-- Glossary descriptions: the measured rewrite, batch 4 (15 rows) — HIGH USAGE
--
-- THE ORDERING CHANGED AND THE YIELD CHANGED WITH IT. Batches 1-3 walked the
-- encyclopedic pool in a fixed seeded order and found 35% / 36% / 25%. This
-- batch takes the same pool ordered by ASSIGNMENT COUNT and finds 15 of 22.
-- The reason is mechanical rather than lucky: the heavily-used tags are the ones
-- an early import gave a Wikipedia lead, so ordering by usage concentrates them.
-- Rows here carry 248 to 3,921 assignments each, against 0-3 for most of the
-- seeded tranches. Same discipline, far more readers per row.
--
-- TWO DRIFT ROWS ARE ONE-WORD DELETIONS, and they are the whole reason
-- styleguide_content_drift is a counter rather than a rewrite:
--   drag       (3,921) "serves as a VIBRANT expression of gender fluidity"
--   kreuzberg  (494)   "known for its VIBRANT arts scene"
-- `vibrant` is a `no-marketing-vocabulary` NEVER term. The word is deleted and
-- not one other word moves — the sentence was already correct.
--
-- ONE IS A SINGLE LETTER-CASE FIX: kink (2,727) wrote "many different VALID
-- approaches", and `no-hype-punctuation` bans ALL CAPS for emphasis.
--
-- THREE NAMESPACE ROWS PUBLISHED THE WRONG SUBJECT ENTIRELY, and the slug
-- prefix is what establishes the sense — the same widened rule `genre-history`
-- and `mat-glass` rest on:
--   vibe-vintage  (2,323) published WINEMAKING — grape harvest, vintage Port
--   vibe-colorful (672)   published the PHYSICS OF COLOR PERCEPTION, including
--                         cone cells, trichromacy and bees seeing ultraviolet
--   mat-metal     (1,489) published the Fermi level
--
-- `gruppen` (532) IS THE ROW WORTH READING, and it is evidence-led rather than
-- guessed. Its description was Karlheinz Stockhausen's 1955-57 orchestral work
-- "Gruppen for three orchestras", filed under Relationship Structures. The tag's
-- intended sense is not recoverable from the row — so it was recovered from what
-- the tag is ATTACHED TO. All 532 assignments are Berlin community events:
-- "Gruppe für Schwule zwischen 25-35", "50+ offene Freizeitgruppe", Narcotics
-- Anonymous, Maneo – Schwule Opferhilfe, HIV and STI testing, psychological
-- counseling. It means community and support groups. THE ASSIGNMENTS ARE THE
-- EVIDENCE, which is a source this series had not used before and which is
-- available on any tag with usage.
-- The German is KEPT and glossed rather than translated away, per
-- `local-scene-vocabulary` ("a scene's own vocabulary stays in its own language
-- with a short gloss ... do not translate").
--
-- WHAT WAS KEPT, and `queer` is the important one: at 13,053 assignments it is
-- the most-used tag in the corpus, and its description is already excellent —
-- the 16th-century origin, the 1890s slur, the 1980s reclamation, Queer Nation
-- in March 1990, and the honest closing that some people still hear the slur.
-- Rewriting it would be vandalism. Also kept: hiv (U=U and the undetectable
-- threshold — load-bearing safety content), acceptance (its tolerance
-- distinction is sharper than anything a rewrite would produce),
-- lgbtqia-rights, festival, gay-owned, mat-lace.
--
-- Voice checked against the live styleguide before scoring: zero avoid-term
-- hits, zero British spellings (one proposal said "counselling" and was
-- corrected to "counseling" before it reached this file), zero hyphenated
-- non-binary, zero second person, zero exclamation marks, every replacement one
-- or two sentences.
--
-- Soft on preconditions, hard on postconditions.

begin;

select set_config('app.actor', 'admin:tag-description-measured-rewrite-b4', true);

-- ---- one-word drift deletions: nothing else in the sentence moves ----------
update unified_tags set description = replace(description, 'a vibrant expression of', 'an expression of')
where slug = 'drag' and status = 'active' and description like '%a vibrant expression of%';

update unified_tags set description = replace(description, 'its vibrant arts scene', 'its arts scene')
where slug = 'kreuzberg' and status = 'active' and description like '%its vibrant arts scene%';

update unified_tags set description = replace(description, 'different VALID approaches', 'different valid approaches')
where slug = 'kink' and status = 'active' and description like '%different VALID approaches%';

-- ---- namespace rows publishing the wrong subject ---------------------------
update unified_tags set description = 'A retro or period aesthetic.'
where slug = 'vibe-vintage' and status = 'active' and description like '%In winemaking, vintage is the process%';

update unified_tags set description = 'A bright, colorful look.'
where slug = 'vibe-colorful' and status = 'active' and description like '%activation of the different types of cone cells%';

update unified_tags set description = 'A hard, lustrous material that conducts heat and electricity well.'
where slug = 'mat-metal' and status = 'active' and description like '%electrons available at the Fermi level%';

-- ---- gruppen: sense recovered from its 532 event assignments ---------------
update unified_tags set description =
  'German for groups: the regular meet-ups, support groups and peer counseling sessions that fill much of the queer community calendar.'
where slug = 'gruppen' and status = 'active' and description like '%Karlheinz Stockhausen%';

-- ---- encyclopedic leads ----------------------------------------------------
update unified_tags set description =
  'The presence and visibility of different identities and perspectives — in media, in leadership, and in decision-making.'
where slug = 'representation' and status = 'active' and description like '%challenging stereotypes, bias, and marginalization%';

update unified_tags set description =
  'An object, body part, behavior or fantasy that is central to a person''s arousal. It need not be physically present — imagining it can be enough.'
where slug = 'fetish' and status = 'active' and description like '%While fetishes can involve specific objects%';

update unified_tags set description =
  'A public act of objection or dissent, from an individual statement to a mass demonstration.'
where slug = 'protest' and status = 'active' and description like '%civil resistance or nonviolent resistance%';

update unified_tags set description = 'The past, and the study of it.'
where slug = 'history' and status = 'active' and description like '%Here%s a breakdown of what history generally explores:';

update unified_tags set description = 'A venue serving coffee and other drinks, often with light food.'
where slug = 'cafe' and status = 'active' and description like '%nargile in Levantine Arabic%';

update unified_tags set description =
  'A condition that makes some activities harder, or that limits equitable access in a given society. Disability may be physical, sensory, cognitive or intellectual, visible or invisible, lifelong or acquired.'
where slug = 'disabled' and status = 'active' and description like '%United Nations Convention on the Rights of Persons with Disabilities%';

update unified_tags set description = 'A ceremony in which two people marry.'
where slug = 'occ-wedding' and status = 'active' and description like '%followed by a wedding reception%';

update unified_tags set description = 'A country comprising the Australian mainland, Tasmania and smaller islands.'
where slug = 'australia' and status = 'active' and description like '%world%s flattest and driest inhabited continent%';

do $verify$
declare
  v_bad int;
begin
  -- 1. the reached state, counted positively
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='drag' and description like '%an expression of gender fluidity%')
    or (slug='kreuzberg' and description like '%known for its arts scene%')
    or (slug='kink' and description like '%different valid approaches%')
    or (slug='vibe-vintage' and description = 'A retro or period aesthetic.')
    or (slug='vibe-colorful' and description = 'A bright, colorful look.')
    or (slug='mat-metal' and description like 'A hard, lustrous material%')
    or (slug='gruppen' and description like 'German for groups:%')
    or (slug='representation' and description like 'The presence and visibility of different identities%')
    or (slug='fetish' and description like 'An object, body part, behavior or fantasy%')
    or (slug='protest' and description like 'A public act of objection or dissent%')
    or (slug='history' and description = 'The past, and the study of it.')
    or (slug='cafe' and description = 'A venue serving coffee and other drinks, often with light food.')
    or (slug='disabled' and description like 'A condition that makes some activities harder%')
    or (slug='occ-wedding' and description = 'A ceremony in which two people marry.')
    or (slug='australia' and description like 'A country comprising the Australian mainland%')
  );
  if v_bad <> 15 then
    raise exception 'tag_description_measured_rewrite_b4: expected 15 rows in the reached state, found %', v_bad;
  end if;

  -- 2. THE THREE MINIMAL EDITS ARE MINIMAL. Each row keeps the rest of the
  --    sentence it had; "the banned word is gone" is equally satisfied by a
  --    pass that replaced the whole description.
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='drag' and description like 'Drag is a performance art form where individuals%'
                   and description like '%comedy, music, and dance%')
    or (slug='kreuzberg' and description like 'Kreuzberg is a district of Berlin%'
                        and description like '%since German reunification in 1990%')
    or (slug='kink' and description like 'Kink or kinky is seen as an umbrella term%'
                   and description like '%Your Kink is Not My Kink%')
  );
  if v_bad <> 3 then
    raise exception 'tag_description_measured_rewrite_b4: a minimal edit became a rewrite (found % of 3)', v_bad;
  end if;

  -- 3. NO `vibrant` OR ALL-CAPS EMPHASIS SURVIVES on the three edited rows
  select count(*) into v_bad from unified_tags
  where status = 'active' and slug in ('drag','kreuzberg','kink')
    and (description ~* '\mvibrant\M' or description like '%VALID%');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b4: % row(s) still carry the banned form', v_bad;
  end if;

  -- 4. `queer` IS NOT TOUCHED. At 13,053 assignments it is the most-used tag in
  --    the corpus and its description is already the standard this work aims at.
  select count(*) into v_bad from unified_tags
  where slug = 'queer' and status = 'active'
    and description like '%Queer Nation formed in March 1990%'
    and description like '%Some people still hear it as the slur it was%';
  if v_bad <> 1 then
    raise exception 'tag_description_measured_rewrite_b4: the queer description was altered';
  end if;

  -- 5. hiv keeps its U=U content (load-bearing safety), acceptance its tolerance
  --    distinction
  select count(*) into v_bad from unified_tags
  where status = 'active' and (
       (slug='hiv' and description like '%undetectable viral load, at which point the virus cannot be transmitted sexually%')
    or (slug='acceptance' and description like '%distinct from mere tolerance%')
  );
  if v_bad <> 2 then
    raise exception 'tag_description_measured_rewrite_b4: a kept row was altered (found % of 2)', v_bad;
  end if;

  -- 6. NO VOICE VIOLATION SHIPS. The `s?` is load-bearing: \m...\M anchors both
  --    ends, so \morganisation\M does not match "organisations".
  select count(*) into v_bad from unified_tags
  where status = 'active'
    and slug in ('vibe-vintage','vibe-colorful','mat-metal','gruppen','representation','fetish',
                 'protest','history','cafe','disabled','occ-wedding','australia')
    and (description ~* '\m(organisation|characterised|recognised|behaviour|licence|counselling)s?\M'
      or description ~* '\mnon-binary\M'
      or description ~* '\m(you|your)\M'
      or description ~ '!');
  if v_bad <> 0 then
    raise exception 'tag_description_measured_rewrite_b4: % row(s) carry a Tone of Voice violation', v_bad;
  end if;
end
$verify$;

commit;
