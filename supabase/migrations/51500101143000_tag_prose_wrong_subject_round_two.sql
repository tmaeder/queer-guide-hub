-- Glossary content, round two: ten more live pages defining a different subject,
-- and the whole disambiguation-artifact cohort.
--
-- Continues `50700101100200`, which worked the top of the backlog
-- `tag_disowned_prose_signals()` counts. That signal read 360 surviving
-- short_descriptions before that migration and reads **352** now, so the
-- previous pass landed and this one takes the next tranche by usage.
--
-- Every row here is ACTIVE. Group A is `seo_indexable`; group B is mostly so.
--
-- ============================================================================
-- GROUP A -- wrong subject (10 rows), same rule as 50700101100200
-- ============================================================================
-- A row is repaired ONLY where its own `description` establishes a sense that
-- the short/long description contradict. That is evidence on the row, not
-- taste, and it is what bounds the change.
--
-- What the bodies actually contained, which is how each was identified:
--
--   leader      452 chars on NEWSPAPER EDITORIALS ("An editorial, also known
--               as a leader…"), over a description reading "Person in charge".
--               The disowned entity was the journalism genre.
--   leatherman  376 chars on the PORTLAND TOOL COMPANY ("founded in 1983 by
--               Timothy S. Leatherman…"), on a Gear row whose description is
--               "Male leather community member".
--   sister      385 chars on NUNS and monastic vows, over "Female sibling".
--   values      355 chars on WIKIDATA PROPERTY SEMANTICS ("used with
--               properties such as 'union of'…"), over a real description of
--               principles and beliefs. The disowned entity was a property
--               dummy value, and the prose is its documentation.
--   stability   219 chars on a WIKIDATA PROPERTY not changing over time, on a
--               Mental Health row.
--   live-music-venue  A concert is a live PERFORMANCE — the act, not the
--               place — on a Venue Types row whose description says "Venue
--               with live music performances".
--   cougar      "Large wild cat native to the Americas" over "Older woman
--               seeking younger partners". No body.
--   woman       "A woman is an adult human female… an organism is considered
--               female if it produces the ovum" -- gamete essentialism over a
--               description that reads "A feminine gender identity that may or
--               may not align with female sex assigned at birth". This is the
--               exact counterpart of `man` in 50700101100200, and it is the
--               one case where that migration's decision INVERTS: `man` kept
--               its body because that body was already trans-inclusive and
--               only its one-line summary was essentialist. `woman`'s body is
--               not, so here both fields are replaced. Read the prose, not the
--               pattern.
--   lady        The same gamete paragraph again, on a Dynamics & Roles row
--               whose description is "Noble female title".
--
-- `lioness` is the deliberate half-measure and is called out rather than
-- folded in. Its short_description read "Female lion **or Russian actress**"
-- and its body named a Russian pornographic actress as a second sense, closing
-- with "it's essential to prioritize accurate and respectful representation" --
-- the padding register TAG_STYLE_SYSTEM bans. But its own description is only
-- "Female lion role", which is as thin as `lion`'s "King of beasts role", and
-- 50500101100000 left `lion` alone precisely because a lioness/lion is not an
-- established queer or kink role the way bear, otter or cub are. So the
-- short_description is set to exactly what the row's own description supports
-- and the body is NULLED rather than rewritten: that removes a named performer
-- from a glossary definition without minting vocabulary. Nulling is safe and
-- asserted -- `enforce_tag_thin_page_gate` reads
-- `tag_has_prose(description, short_description)` only.
--
-- ============================================================================
-- GROUP B -- disambiguation artifacts (14 rows), a DIFFERENT rule
-- ============================================================================
-- These short_descriptions are not a wrong subject; they are a non-answer --
-- "Term with multiple meanings", "Term with various meanings", "Edging has
-- multiple meanings", "Term without recognized definition" -- the residue of a
-- disambiguation page. Measured corpus-wide the cohort is exactly 14 rows, 10
-- of them indexable, so it is closed here rather than sampled.
--
-- The rule is narrower than group A's and needs no judgement at all: the new
-- short_description is DERIVED FROM THE ROW'S OWN `description`, which in
-- every one of the 14 is a real, specific, curated definition. Nothing is
-- invented and no sense is chosen -- the sense was already on the row, it
-- simply never reached the summary line that cards and previews render.
-- `description` is therefore untouched here too.
--
-- ============================================================================
-- Discipline carried over from 50700101100200
-- ============================================================================
--   * `description` is NEVER written. It is the evidence in both groups.
--   * Prose is REPLACED, never retracted, except `lioness`'s body as explained.
--   * Every UPDATE is CONTENT-GUARDED on the defect's own text, so a human who
--     corrects one first keeps their work and this file no-ops.
--   * Postconditions assert THE DEFECT IS GONE, not that this file's exact
--     wording is present -- pinning the wording aborts `db push` on main if a
--     human writes better prose first, which blocks every migration queued
--     behind it. Soft on preconditions, hard on postconditions.
--
-- TRAP: `log_unified_tag_change()` RAISEs when an actor matching `system:%`
-- modifies a `human_reviewed` row. Seven rows here are human_reviewed
-- (leader, lioness, woman, leatherman, sister, lady, cougar), so without the
-- set_config below this migration aborts.

begin;

select set_config('app.actor', 'migration:51500101143000', true);

-- ── Group A ────────────────────────────────────────────────────────────────

update unified_tags
   set short_description = 'A person who holds authority or direction in a group.',
       long_description  = 'A leader is a person who holds authority or direction within a group. In queer community contexts the term covers organisers, chairs of community organisations, and the people who carry an event or a campaign — work that is frequently unpaid, informal, and held alongside a job.'
 where slug = 'leader' and status = 'active'
   and short_description = 'Newspaper or magazine opinion piece'
   and long_description like 'An editorial, also known as a leader%';

-- See the header: sense deliberately NOT minted, body nulled rather than rewritten.
update unified_tags
   set short_description = 'Female lion role.',
       long_description  = null
 where slug = 'lioness' and status = 'active'
   and short_description = 'Female lion or Russian actress';

update unified_tags
   set short_description = 'A feminine gender identity, held by trans and cis women alike.',
       long_description  = 'A woman is a person with a feminine gender identity. That identity may or may not align with the sex she was assigned at birth: trans women are women, and the category is not defined by anatomy, chromosomes or reproductive capacity. Some people hold woman alongside a non-binary identity rather than instead of one.'
 where slug = 'woman' and status = 'active'
   and short_description = 'Female individual'
   and long_description like 'A woman is an adult human female%';

update unified_tags
   set short_description = 'A man in the leather community.',
       long_description  = 'A leatherman is a man who belongs to the leather community — a subculture built around leather gear, BDSM, and its own codes of dress, protocol and title. It took its current meaning from the gay leather bars, clubs and runs that grew up from the 1950s onward. Leatherman is also a brand of multi-tool; the two are unrelated.'
 where slug = 'leatherman' and status = 'active'
   and short_description = 'American multi-tool brand'
   and long_description like 'Leatherman is an American brand of multi-tool%';

update unified_tags
   set short_description = 'A venue that hosts live music.',
       long_description  = 'A live music venue is a place that programmes live performance — anything from a bar with a small stage to a dedicated concert hall. In queer nightlife the category overlaps heavily with bars and clubs: a room that reads as a music venue on one night often runs a club, cabaret or drag night on another.'
 where slug = 'live-music-venue' and status = 'active'
   and short_description = 'Live performance of music'
   and long_description like 'A concert is a live performance of music%';

update unified_tags
   set short_description = 'The principles that guide how a person or organisation acts.',
       long_description  = 'Values are the principles and beliefs that guide how a person or an organisation acts. In a rights context they are what a movement appeals to where the law is silent or hostile — dignity, autonomy, equal treatment — and they are equally what opposing campaigns invoke, so an appeal to values is an argument rather than a settled fact.'
 where slug = 'values' and status = 'active'
   and short_description = 'List of values'
   and long_description like 'This tag represents a collection of values%';

update unified_tags
   set short_description = 'A female sibling, or the role played as one.',
       long_description  = 'A sister is a female sibling. The word also carries chosen-family weight, where queer people use it for close friends who do the work family is supposed to do, and it appears as a role-play framing borrowed from that vocabulary and played between adults. Sister is separately the title of a woman in a religious order, which is a different sense.'
 where slug = 'sister' and status = 'active'
   and short_description = 'Female member of a monastic order'
   and long_description like 'A sister is a woman who dedicates her life to religious service%';

update unified_tags
   set short_description = 'A settled state in mood, housing, income or support.',
       long_description  = 'Stability is a settled state — in mood, housing, income, relationships or support — that makes everything else easier to manage. It recurs in queer mental health because the things that supply it are the things most often disrupted: family rejection, housing insecurity, discrimination at work, and moving somewhere safer all cost stability, and rebuilding it tends to depend on community rather than on family of origin.'
 where slug = 'stability' and status = 'active'
   and short_description = 'Unchanging value'
   and long_description like 'This property is expected to remain the same%';

update unified_tags
   set short_description = 'A title of address, noble in origin, used as an honorific.',
       long_description  = 'Lady began as a title for a woman of noble rank. In power exchange it survives as an honorific — a form of address a submissive uses for a dominant woman, in the same family as Sir, Master and Mistress — where what matters is the formality of the address rather than any claim to rank.'
 where slug = 'lady' and status = 'active'
   and short_description = 'Female-identifying individual'
   and long_description like 'A lady is an individual who identifies as female%';

-- long_description is already NULL on this row; only the summary is wrong.
update unified_tags
   set short_description = 'An older woman who dates younger partners.'
 where slug = 'cougar' and status = 'active'
   and short_description = 'Large wild cat native to the Americas';

-- ── Group B: summaries derived from each row's own description ──────────────

update unified_tags set short_description = 'A reclaimed term for a masculine lesbian.'
 where slug = 'dyke' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'Repeatedly approaching orgasm and stopping short of it.'
 where slug = 'edging' and status = 'active' and short_description = 'Edging has multiple meanings';

update unified_tags set short_description = 'The third level in a hierarchy.'
 where slug = 'delta' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'A protocol honorific used in power exchange.'
 where slug = 'yes-sir' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'A hinged instrument that holds open the vagina or anus, used in medical play.'
 where slug = 'speculum' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'Someone who teases.'
 where slug = 'tease' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'A maiden-in-need-of-rescue role.'
 where slug = 'damsel' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'A young man kept as a plaything.'
 where slug = 'boy-toy' and status = 'active' and short_description = 'Term with various meanings';

update unified_tags set short_description = 'Someone attracted to larger men, or to a particular type.'
 where slug = 'chaser' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'A C-shaped vibrator that stimulates the clitoris and vaginal walls.'
 where slug = 'c-ring' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'Porn slang for a heavily gaped anus.'
 where slug = 'mare-cunt' and status = 'active' and short_description = 'Term without recognized definition';

update unified_tags set short_description = 'An archetype driven to expose painful hidden truths.'
 where slug = 'vivisector' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'Slang for being penetrated from behind.'
 where slug = 'backshot' and status = 'active' and short_description = 'Term with multiple meanings';

update unified_tags set short_description = 'Men who have sex with men while keeping it secret.'
 where slug = 'down-low' and status = 'active' and short_description = 'Term with multiple meanings';

do $verify$
declare
  v_bad int;
  v_note int;
begin
  -- HARD: the defect is gone. Satisfied by this file's fix AND by a better one
  -- someone else writes first, which is why it tests for the WRONG text rather
  -- than for this file's wording.
  select count(*) into v_bad from unified_tags
   where status = 'active'
     and ((slug='leader'           and short_description = 'Newspaper or magazine opinion piece')
       or (slug='lioness'          and short_description = 'Female lion or Russian actress')
       or (slug='woman'            and short_description = 'Female individual')
       or (slug='leatherman'       and short_description = 'American multi-tool brand')
       or (slug='live-music-venue' and short_description = 'Live performance of music')
       or (slug='values'           and short_description = 'List of values')
       or (slug='sister'           and short_description = 'Female member of a monastic order')
       or (slug='stability'        and short_description = 'Unchanging value')
       or (slug='lady'             and short_description = 'Female-identifying individual')
       or (slug='cougar'           and short_description = 'Large wild cat native to the Americas'));
  if v_bad <> 0 then
    raise exception '% group-A wrong-subject short_description(s) still live', v_bad;
  end if;

  -- SCOPED BY SLUG, not corpus-wide. The first draft of this block tested the
  -- bodies with a bare `long_description like …` across every active tag and
  -- failed the dry run at 1 — correctly, but not for the reason it looked.
  -- The row it caught was `live-music` (57 uses, Events & Parties), which
  -- carries the SAME concert body as `live-music-venue` and for which that body
  -- is RIGHT: live music IS the performance. Only `live-music-venue` is wrong,
  -- because a venue is a place rather than an act. A corpus-wide text assertion
  -- cannot tell those apart, and had it been written the other way round — a
  -- corpus-wide UPDATE instead of a corpus-wide check — it would have rewritten
  -- a correct row. Assert about the rows this migration names.
  select count(*) into v_bad from unified_tags
   where status = 'active'
     and ((slug='leader'           and long_description like 'An editorial, also known as a leader%')
       or (slug='leatherman'       and long_description like 'Leatherman is an American brand of multi-tool%')
       or (slug='sister'           and long_description like 'A sister is a woman who dedicates her life to religious service%')
       or (slug='values'           and long_description like 'This tag represents a collection of values%')
       or (slug='stability'        and long_description like 'This property is expected to remain the same%')
       or (slug='live-music-venue' and long_description like 'A concert is a live performance of music%')
       or (slug='woman'            and long_description like 'A woman is an adult human female%')
       or (slug='lady'             and long_description like 'A lady is an individual who identifies as female%')
       or (slug='lioness'          and long_description like 'The term ''Lioness'' can refer to a female lion%'));
  if v_bad <> 0 then
    raise exception '% group-A wrong-subject long_description(s) still live', v_bad;
  end if;

  -- REPORTS: the sibling the scoping exists for. `live-music` is deliberately
  -- NOT repaired — its prose is correct for an events tag.
  if not exists (select 1 from unified_tags where slug='live-music' and status='active'
                   and short_description = 'Live performance of music') then
    raise notice 'live-music no longer reads "Live performance of music" (edited elsewhere; it was correct and left alone here)';
  end if;

  -- HARD: the disambiguation cohort is CLOSED, not sampled. Measured at 14.
  select count(*) into v_bad from unified_tags
   where status = 'active'
     and short_description ~* '(has|with) multiple meanings|^term with|may refer to';
  if v_bad <> 0 then
    raise exception '% disambiguation-artifact short_description(s) remain', v_bad;
  end if;

  -- REPORTS. `description` is the evidence for every repair above and this file
  -- never writes it, so a difference means someone else did — not this file's
  -- to enforce, and not worth aborting a push for.
  select count(*) into v_note from unified_tags
   where status = 'active'
     and ((slug='leader'     and description is distinct from 'Person in charge')
       or (slug='lioness'    and description is distinct from 'Female lion role')
       or (slug='leatherman' and description is distinct from 'Male leather community member')
       or (slug='sister'     and description is distinct from 'Female sibling')
       or (slug='cougar'     and description is distinct from 'Older woman seeking younger partners'));
  if v_note <> 0 then
    raise notice '% description(s) differ from what this migration read as evidence (edited elsewhere; not an error)', v_note;
  end if;

  -- REPORTS: `lion` stays untouched, and this file inherits that decision.
  -- 50700101100200 left it because its sense cannot be established from the
  -- row; `lioness` is handled here only as far as the same evidence allows.
  if not exists (select 1 from unified_tags where slug='lion' and status='active'
                   and short_description = 'Large cat species') then
    raise notice 'lion no longer carries its zoology short_description (fixed elsewhere; still deliberately untouched here)';
  end if;
end
$verify$;

commit;
