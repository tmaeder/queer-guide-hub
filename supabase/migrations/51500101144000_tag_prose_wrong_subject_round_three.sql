-- Glossary prose round three: eleven more pages whose body is about a different thing.
--
-- Continues 50700101100200 and 51500101143000 down the backlog
-- tag_disowned_prose_signals() counts. Measured before writing anything:
-- sd_surviving 352, ld_surviving 291, indexable_surviving 327 (round two is
-- merged but not yet applied, so its 24 are still inside those numbers and are
-- excluded here by slug).
--
-- SAME SELECTION RULE as both previous rounds, and it is what bounds this file:
-- a row is repaired ONLY where its own `description` establishes a sense that
-- the short/long description contradict. That is evidence on the row, not
-- taste. 64 candidates were read by hand, ordered by usage; 11 qualified.
-- The other 53 are NOT defects -- "surviving" means the prose is unchanged
-- since the identifier was taken away, which for most rows means it was right
-- all along (lgbtq, drag, acceptance, stigma, resilience, chosen-family and
-- the whole STI cohort are all correct and are left alone). That ratio is the
-- point: 50500101100300 records ~45% as a hand-read upper bound, and the top
-- of the backlog reads lower because it has already been worked.
--
-- WHAT THE DISOWNED ENTITIES TURN OUT TO BE. Ordering the qualifying rows by
-- what the body is actually about produces two clean families and one row that
-- belongs to neither:
--
--   A PLACE or an ORGANISATION
--     ally   -> the commune of Ally, Cantal, Auvergne-Rhone-Alpes, France
--     baby   -> the commune of Baby, Seine-et-Marne, Ile-de-France, France
--     coven  -> Coventry University, Coventry, England
--     reading-> Reading, a historic market town in Berkshire, England
--     nudist -> a NUDE BEACH -- a place, on a row whose summary says
--               "a person, not a place"
--
--   A BAND, A SHOW or A SPECIES
--     shame       -> Shame, a British alternative rock band
--     big-brother -> Big Brother, an American reality competition show
--     bear        -> Ursidae, the carnivoran mammals
--
--   NARROWED RATHER THAN WRONG
--     femme  -> "a lesbian woman", on a row whose description says
--               "regardless of gender"
--     butch  -> "...and is also a male given name", disambiguation residue
--
-- `nudist` is the sharpest of them and the highest-usage row here (571 uses,
-- indexable). Somebody already corrected its summary to read "Someone who goes
-- without clothes by preference -- a person, not a place." The body sitting
-- directly beneath that sentence is 400 characters about nude beaches. The
-- contradiction is not subtle and it is not inferred; the row argues with
-- itself on the page.
--
-- `shame` is the one that asserts its own defect. Its body closes: "In the
-- context of this platform, the tag 'Shame' primarily refers to the British
-- band." That sentence is false about this platform, and it is the reason the
-- row cannot be left to a later pass on the grounds of low usage.
--
-- QUEEN IS DELIBERATELY NOT REPAIRED, and its body is NULLED instead.
-- The rock band is wrong under any reading, so leaving it is not an option.
-- But the intended sense cannot be established from the row, and three signals
-- disagree: `description` says "Female ruler" (the monarch), `category` says
-- Slang & Language, and on a queer glossary the live sense is drag and gay
-- slang. Guessing a sense is how this entire class arose, so the false claim
-- is removed and no vocabulary is minted -- the half-measure 51500101143000
-- took with `lioness`. Nulling is safe and asserted below rather than assumed:
-- enforce_tag_thin_page_gate reads tag_has_prose(description,
-- short_description) only, and it is not even reached, because that trigger is
-- scoped to `description, short_description` and this writes neither.
--
-- ALLY keeps its description and that is a stated limitation, not an oversight.
-- "An ally is a member of an alliance." is the generic dictionary sense on an
-- Orientation row with 70 uses. This file never writes `description` -- it is
-- the evidence that justified the change -- so the body is replaced with the
-- queer sense (corroborated by the category, by the usage, and by the disowned
-- body's own final sentence, which already named the social sense) and the
-- thin description is left for a separate decision. Its `short_description` is
-- NULL and is FILLED: filling a null is not the LLM rewrite both auto-apply
-- paths were retired for.
--
-- SEARCH CHURN IS ZERO FOR SEVEN OF THE ELEVEN, by construction rather than by
-- care. trg_search_documents_tag is scoped over
--   name, short_description, description, category, slug, image_url,
--   entity_kind, merged_into_id, deprecated_at, status
-- and `long_description` is NOT in that list, so the seven body-only repairs
-- reindex nothing. The four that write short_description (ally, bear, butch,
-- femme) do reindex, which is correct -- search_documents_index_tags emits the
-- summary.
--
-- TRAP: log_unified_tag_change() RAISEs when an actor matching 'system:%'
-- modifies a human_reviewed row, and NINE of these eleven are human_reviewed.
-- The set_config below is load-bearing, not decorative.
--
-- Discipline carried over from both previous rounds:
--   * `description` is never written.
--   * Prose is REPLACED, never retracted, except queen's body as explained --
--     every row here is active and rendering, so nulling leaves a thinner page
--     where a replacement leaves a correct one.
--   * Every UPDATE is content-guarded on the defect's own text, so a human who
--     corrects one first keeps their work and this file no-ops on that row.
--   * Postconditions assert THE DEFECT IS GONE, not that this file's wording is
--     present, so someone else's better fix satisfies them too.
--   * Everything this file does not control -- description drift, lion, gym --
--     REPORTS rather than aborting the push.

select set_config('app.actor', 'admin:tag-prose-round-three', true);

-- ---------------------------------------------------------------------------
-- Group A: the body is about a place, an organisation, a band, a show, a species
-- ---------------------------------------------------------------------------

update public.unified_tags set long_description =
'Nudism, also called naturism, is the practice of going without clothes, alone or socially. A nudist is a person who prefers it. The beaches, saunas, clubs and resorts where it happens are venues, and this glossary files those separately.

Social nudism is not in itself sexual, and naturist settings generally draw that line explicitly. Venues that combine nudity with sex are a different category and usually describe themselves as such, which is the distinction worth establishing before visiting somewhere unfamiliar. Clothing-optional is a third thing again: clothes are permitted, which changes both the atmosphere and the crowd.'
where slug = 'nudist' and status = 'active'
  and long_description like 'A nude beach is a beach%';

update public.unified_tags set
  short_description = 'Someone outside a group who supports it, in practice rather than in sentiment.',
  long_description =
'An ally is a person who is not themselves part of a marginalised group but supports it. In the LGBTQ+ context that usually means a straight or cisgender person who backs queer and trans people.

The word describes conduct, not identity. In practice it is ordinary and unglamorous: using someone''s name and pronouns without needing to be asked twice, objecting to a remark when the person it targets is not in the room, and taking a correction without treating it as an accusation. It is not a title anyone awards themselves once and keeps.'
where slug = 'ally' and status = 'active'
  and long_description like 'The commune of Ally%';

update public.unified_tags set
  short_description = 'A larger, hairier man in gay and queer men''s communities.',
  long_description =
'Bear describes a larger, hairier man, and the communities and events built around that: bear runs, bear bars, bear nights and a club scene with a long history of its own.

It sits in a loose family of words rather than a fixed taxonomy. Cub is a younger or smaller bear, otter a leaner hairy man, chaser someone drawn to bears. None of them is a rule, and people apply them to themselves far more reliably than to anyone else. The label carries a body-positive history: it named a way of being a gay man that the dominant imagery of the 1980s and 1990s left out.'
where slug = 'bear' and status = 'active'
  and short_description = 'Large, carnivorous mammals'
  and long_description like 'Bears are carnivoran mammals%';

update public.unified_tags set long_description =
'Big brother is an age-play and mentoring role: the older sibling, with the authority and the protectiveness that implies. It usually runs on care and guidance rather than discipline, though where that line falls is for the people involved to set.

It makes no claim about anyone''s real family. Like the other family-shaped roles, it borrows the shape of the relationship and leaves the biology out.'
where slug = 'big-brother' and status = 'active'
  and long_description like 'Big Brother is an American television%';

update public.unified_tags set long_description =
'Shame play uses embarrassment and exposure deliberately, as something everyone involved has agreed to. It overlaps with humiliation play and is often filed alongside it, though shame tends to name the internal feeling where humiliation names what is done to produce it.

The feeling it works with is one many queer people carry for real reasons, about bodies, desires, or being queer at all. That is what makes knowing in advance which of those is off the table matter more here than in most play.'
where slug = 'shame' and status = 'active'
  and long_description like 'Shame is a British musical group%';

update public.unified_tags set long_description =
'Reading is taking in the sense of written or tactile symbols, by sight or, in the case of braille, by touch.

On this platform the tag covers books, zines, poetry and the places and events built around them: queer bookshops, library collections, reading groups and spoken-word nights. Queer reading has a distribution history of its own, since for long stretches the books were difficult to obtain, and the shops and libraries that carried them were doing work nothing else did.'
where slug = 'reading' and status = 'active'
  and long_description like 'Reading is a historic market town%';

update public.unified_tags set long_description =
'Baby is an age-play role at the youngest end of the range, overlapping with littles and with caregiver dynamics such as daddy, mommy and big brother.

It is a role adults take with other adults. The appeal is generally being cared for and carrying no responsibility for a while, rather than anything to do with actual children, and the scene vocabulary keeps that distinction sharp.'
where slug = 'baby' and status = 'active'
  and long_description like 'Baby is a commune%';

update public.unified_tags set long_description =
'A coven is a small, closed group bound by ritual, chosen kinship or shared practice. The word comes from witchcraft and is used in queer and kink contexts for a household or circle with its own rules and its own way in.

It overlaps with chosen family and with the house structures of ballroom culture, though a coven usually implies something more deliberately ritual, and more private.'
where slug = 'coven' and status = 'active'
  and long_description like 'Coventry University is a public research university%';

-- ---------------------------------------------------------------------------
-- Group B: on-subject but narrowed, against the row's own description
-- ---------------------------------------------------------------------------

update public.unified_tags set
  short_description = 'A feminine gender expression, used across the queer community regardless of gender.',
  long_description =
'Femme names a feminine gender expression claimed deliberately rather than simply assumed. It came out of lesbian communities, where it has a long history alongside butch, and it is used now by queer people of any gender: lesbians, bisexual and pansexual people, gay men, trans women and trans men, and nonbinary people.

It is not the same as being feminine. The word marks femininity worn on purpose, often at some cost, in a culture that reads feminine queer people as either straight or as not queer enough.'
where slug = 'femme' and status = 'active'
  and short_description = 'Feminine lesbian identity or presentation'
  and long_description like 'Femme refers to a lesbian woman%';

update public.unified_tags set
  short_description = 'A masculine gender expression, claimed within queer communities.',
  long_description =
'Butch names a masculine gender expression claimed deliberately. It has its longest history in lesbian communities, alongside femme, and is used by lesbians, bisexual and queer women, trans men, nonbinary people and others.

It describes presentation and bearing rather than a fixed identity, and it is not a statement about anyone''s gender. A butch lesbian and a trans man are not the same thing, though the words have sat close together historically and some people have moved between them.'
where slug = 'butch' and status = 'active'
  and long_description like 'Butch can refer to a person, often with masculine traits, and is also a male given name%';

-- ---------------------------------------------------------------------------
-- Group C: the claim is removed, no sense is chosen
-- ---------------------------------------------------------------------------

update public.unified_tags set long_description = null
where slug = 'queen' and status = 'active'
  and long_description like 'The term Queen can refer to a British rock band%';

-- ---------------------------------------------------------------------------
-- Postconditions: the defect is gone. Nothing asserts this file's wording.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad int; v_note text; v_n int;
begin
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (   (slug = 'nudist'      and long_description like 'A nude beach is a beach%')
          or (slug = 'ally'        and long_description like 'The commune of Ally%')
          or (slug = 'bear'        and (short_description = 'Large, carnivorous mammals'
                                     or long_description like 'Bears are carnivoran mammals%'))
          or (slug = 'big-brother' and long_description like 'Big Brother is an American television%')
          or (slug = 'shame'       and long_description like 'Shame is a British musical group%')
          or (slug = 'reading'     and long_description like 'Reading is a historic market town%')
          or (slug = 'baby'        and long_description like 'Baby is a commune%')
          or (slug = 'coven'       and long_description like 'Coventry University is a public research university%')
          or (slug = 'femme'       and (short_description = 'Feminine lesbian identity or presentation'
                                     or long_description like 'Femme refers to a lesbian woman%'))
          or (slug = 'butch'       and long_description like 'Butch can refer to a person, often with masculine traits, and is also a male given name%')
          or (slug = 'queen'       and long_description like 'The term Queen can refer to a British rock band%'));
  if v_bad > 0 then
    raise exception 'round three: % row(s) still publish the disowned entity', v_bad;
  end if;

  -- queen must hold no body at all, which is the whole of its repair.
  if exists (select 1 from public.unified_tags
              where slug = 'queen' and status = 'active'
                and coalesce(long_description, '') <> '') then
    raise exception 'round three: queen.long_description is not null -- a sense was chosen, which this file must not do';
  end if;

  -- ally's summary was NULL and is filled; an empty one means the UPDATE was
  -- skipped by its own guard while the body still needed the pair to agree.
  if exists (select 1 from public.unified_tags
              where slug = 'ally' and status = 'active'
                and coalesce(short_description, '') = ''
                and long_description not like 'The commune of Ally%') then
    raise notice 'round three: ally has a repaired body and no summary -- check it was not half-applied';
  end if;

  -- The corpus convention is real newlines inside the quoted string
  -- (20261007120000). `like ''%\n%''` cannot test this: in a LIKE pattern the
  -- backslash is the ESCAPE character, so that pattern means "contains the
  -- letter n" and matches every row -- the defect 50900101100000 shipped and
  -- caught on its own dry run. position() is what actually asserts it.
  select count(*) into v_n from public.unified_tags
   where status = 'active'
     and slug in ('nudist','ally','bear','big-brother','shame','reading','baby','coven','femme','butch')
     and (position('\n' in coalesce(long_description,'')) > 0
       or position('\n' in coalesce(short_description,'')) > 0);
  if v_n > 0 then
    raise exception 'round three: % row(s) carry a literal backslash-n instead of a newline', v_n;
  end if;

  -- Reported, never enforced: this file does not own any of it.
  select string_agg(slug, ', ' order by slug) into v_note
    from public.unified_tags
   where status = 'active' and slug in ('lion','gym')
     and (short_description is not null or long_description is not null);
  if v_note is not null then
    raise notice 'round three: still deliberately untouched (sense not establishable from the row): %', v_note;
  end if;

  raise notice 'round three: queen keeps description "Female ruler" and ally keeps "An ally is a member of an alliance." -- both are the generic sense and both are a separate decision';
end $verify$;
