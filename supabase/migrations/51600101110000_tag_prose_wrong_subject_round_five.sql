-- Glossary prose round five: nine rows in THREE classes, labelled rather than blended.
--
-- Continues 50700101100200 / 51500101143000 / 51500101144000 / 51500101152700 /
-- 51500101160000 down the backlog tag_disowned_prose_signals() counts
-- (sd_surviving 323, ld_surviving 264, indexable_surviving 294 when authored).
--
-- ROUND FOUR SAID THE HEAD OF THIS BACKLOG WAS WORKED OUT, AND THIS PASS BOTH
-- CONFIRMS AND QUALIFIES THAT. Confirms: the very top is genuinely clean, and
-- the rows round three read and left (`lgbtq` 5340, `drag` 3883, `acceptance`
-- 2142) are still correct and still untouched. Qualifies: re-reading the whole
-- surviving list rather than only the usage head found FIVE wrong subjects that
-- earlier passes had not reached, and the largest is `identity` at **541 uses**.
-- So "the head is worked out" was right about the top twenty and wrong as a
-- claim about high-usage rows in general — a hit rate measured over one ordering
-- does not transfer to a different ordering, and re-reading a list you have
-- already sampled is not redundant when the sample was taken by usage and the
-- defect does not correlate with usage.
--
-- ── GROUP A — WRONG SUBJECT, the ORIGINAL rule ──────────────────────────────
-- Repaired only where the row's own `description` establishes a sense the
-- short/long description contradict. No category inference is needed for any
-- of these five; the evidence is on the row.
--
--   identity     Gender, 541 uses, indexable. `description` establishes "an
--                individual's sense of self, including their gender identity,
--                sexual orientation". The body ran through "philosophy,
--                MATHEMATICS, and social sciences" and then "IDENTITY
--                DOCUMENTS, which are official papers that verify an
--                individual's identity". The highest-usage wrong subject found
--                since `darkroom`. Summary replaced too: "Concept of self and
--                group affiliation" is the generic dictionary sense, and it is
--                the lead line on a Gender page.
--   solidarity   Politics & Activism, 45. `description` establishes solidarity
--                BETWEEN MARGINALISED GROUPS against racism and discrimination.
--                The body is the POLISH TRADE UNION FEDERATION — "Solidarity,
--                which evolved into a broad anti-authoritarian social
--                movement". Correct about Poland, wrong about this row.
--   awareness    Slang & Language, 38. `description` establishes "raising
--                consciousness about issues". Summary and body are
--                EPISTEMOLOGY — "true belief that is distinct from opinion or
--                guesswork by virtue of justification", "Philosophers have
--                debated the nature of awareness". Both fields replaced.
--   dyke         Orientation, 1 use, human_reviewed, indexable. `description`
--                and summary are both correct ("A reclaimed term for a
--                masculine lesbian"). The body: "The term 'Dyke' can refer to a
--                FAMILY NAME, as listed on Wikidata." Body only.
--   man          Orientation, 10, human_reviewed, indexable. NOT a wrong
--                subject — a NARROWED one, the `femme` / `drag-show` class. The
--                row's own summary is already right ("held by trans and cis men
--                alike") and the body opens by centring people "assigned male
--                at birth", which is what that summary exists to refuse. Body
--                only; the summary is the evidence and is kept.
--
-- ── GROUP B — WRONG SUBJECT, the WIDENED rule (51500101152700) ──────────────
--   old-theatre  Venue Types, 1 use, indexable, `description` IS NULL — so the
--                original rule cannot reach it and the category is what
--                establishes the sense: a row named `old-theatre` filed under
--                Venue Types is a venue type. The body is ONE NAMED BUILDING in
--                Stamford, England, plus unresolved disambiguation residue
--                about "a Stamford Arts Centre in SINGAPORE, which was
--                previously used as a school" and a closing admission that "the
--                theatre's current status and activities are not specified in
--                the given sources".
--
-- ── GROUP C — NOT A WRONG SUBJECT. A REGISTER defect, named as its own class ─
-- These three rows are ABOUT THE RIGHT THING. Each was read in full and the
-- subject verified correct. What is wrong is one sentence in each that CITES
-- ITS OWN SOURCE TO THE READER — the register `impaired-driving`, `bondage`
-- and `sti-testing` were already repaired for, and which `TAG_STYLE_SYSTEM`
-- bans. The repair is deliberately the SMALLEST that removes the defect: the
-- offending sentence is deleted and every other sentence is kept BYTE-IDENTICAL.
-- This is not a licence to rewrite correct-but-weak prose in bulk — that is the
-- experiment this repo ran and retired when the prose judge retracted 16 rows
-- and got 13 wrong.
--
--   pride-events       250 uses. "According to a scientific article published
--                      on 2 March 2022, pride events play a crucial role in
--                      promoting LGBTQ+ rights and community building."
--   gay-men            162 uses. "According to various sources, including a
--                      book by Murat Hocaoglu, gay men have been part of human
--                      history and culture."
--   workplace-equality  55 uses. "A scientific article published in 2007
--                      highlights the importance of such initiatives in
--                      fostering a positive work environment."
--
-- THE ACTOR DECLARATION IS LOAD-BEARING ON THIS TRANCHE, and that is the
-- opposite of round four, which is why both files say which case they are in.
-- `man` and `dyke` are `human_reviewed = true`, and log_unified_tag_change()
-- RAISEs when a `system:%` actor modifies such a row. Round four's three rows
-- were all human_reviewed = false and its set_config was attribution only. Do
-- not carry either file's claim over to the other; read the rows.
--
-- SEARCH CHURN: trg_search_documents_tag is scoped over
--   name, short_description, description, category, slug, image_url,
--   entity_kind, merged_into_id, deprecated_at, status
-- so the six body-only repairs (solidarity, dyke, man, pride-events, gay-men,
-- workplace-equality) reindex NOTHING; identity, awareness and old-theatre also
-- replace a summary and correctly do.
--
-- NOT REPAIRED, named so the next pass does not re-read them:
--   diversity      Slang & Language, 165 uses. Prose is CORRECT; "diversity" is
--                  not a slang term, so the CATEGORY is wrong. That is the
--                  `warlord` / `potato-salad` disposition — a filing question.
--   the Dynamics & Roles / Fetishes generic-sense cohort — `teacher`, `priest`,
--                  `acolyte`, `angel`, `frog`, `goat`, `villain`, `devotee`,
--                  `humiliation`, `chauffeur`, `diva`. On every one of these the
--                  `description` AGREES with the body ("Amphibian role" over
--                  prose about the order Anura), so the original rule does not
--                  reach them and there is no contradiction to repair. Whether
--                  a kink-roleplay vocabulary should carry the zoological entry
--                  for a goat is a decision about the whole cohort, deferred for
--                  the third pass running.
--   ice-cream, tapas  Venue Types whose bodies describe the FOOD. Deliberately
--                  left: unlike `rooftop`, where "the top covering of a
--                  building" is not a venue under any reading, what an ice
--                  cream shop sells IS ice cream. Generic is not wrong.
--   dyke's seo_indexable  The house convention for reclaimed slurs (`faggot`,
--                  `shemale`, `breeder`) is active + is_sensitive + is_adult +
--                  seo_indexable=false; `dyke` is indexable and not flagged.
--                  Whether it belongs in that cohort is an editorial call about
--                  a word many people use for themselves, and deindexing a page
--                  is not a prose fix. Reported by the verify block, not made.
--
-- Discipline carried over: `description` is NEVER written — it is the evidence
-- for all five Group A rows. Prose is REPLACED, never retracted, because every
-- row is active and rendering. Every UPDATE is content-guarded on the defect's
-- own text so a human who fixes one first keeps their work. Postconditions
-- assert the defect is GONE rather than that this file's wording is present,
-- and everything this file does not own reports instead of aborting.

select set_config('app.actor', 'admin:tag-prose-round-five', true);

-- ── Group A ────────────────────────────────────────────────────────────────

update public.unified_tags set
  short_description = 'Who a person understands themselves to be — including gender and orientation.',
  long_description =
'Identity, on this platform, means the parts of how someone understands themselves that this site is organised around: gender, orientation, relationship to community, and the words a person chooses for any of it.

Two things follow that are worth stating plainly. A label is a description a person applies to themselves, not a test they have to pass — and it can change, or be held loosely, or be refused altogether without anything being unresolved. And identity is not the same as disclosure: someone can be certain of who they are and still decide, correctly, that a particular room is not a place to say so.'
where slug = 'identity' and status = 'active'
  and long_description like 'Identity refers to the concept of self and group affiliation%';

update public.unified_tags set long_description =
'Solidarity is support that costs the giver something and is offered because another group''s fight is recognised as connected to your own, rather than as charity extended downward.

In queer organising it is the reason Pride has carried banners for causes that are not narrowly about sexuality — and the reason the absence of it gets noticed: a movement that wins protections for its most comfortable members and stops there has made a choice about everyone it left behind. Trans people, people of colour, disabled people and sex workers are usually the ones for whom that choice is not abstract.'
where slug = 'solidarity' and status = 'active'
  and long_description like '%Polish trade union federation Solidarity%';

update public.unified_tags set
  short_description = 'Raising public consciousness about an issue.',
  long_description =
'Awareness, in this context, is organised attention: a day, a week, a campaign or a ribbon that exists to move something from unspoken to discussable.

It is worth being clear about what it does and does not achieve. Awareness work changes what people are willing to say and ask about, which is the precondition for most other change — and it is not itself a policy, a service or a budget. A campaign that raises awareness of a condition while the clinic that treats it stays unfunded has done the first half of the job.'
where slug = 'awareness' and status = 'active'
  and long_description like 'Awareness refers to the mental possession of information or skills%';

update public.unified_tags set long_description =
'Dyke is a reclaimed word for a masculine or gender-nonconforming lesbian, taken back from use as a slur and now carried with pride by many of the people it was aimed at — in Dyke Marches, in bar names, in how people introduce themselves.

Reclamation is not universal and it is not transferable. Plenty of lesbians do not use it for themselves, and the word lands very differently depending on who is saying it: inside the community it is ordinary, from outside it can still be an insult.'
where slug = 'dyke' and status = 'active'
  and long_description like 'The term ''Dyke'' can refer to a family name%';

update public.unified_tags set long_description =
'A man is a person with a masculine gender identity. That includes trans men and cis men, and the word does not belong more to one than the other.

Some men are assigned male at birth and some are not; some are read as men everywhere and some are not; some arrive at the word early and some after a long time. None of that makes anyone more or less a man, and a man who is also nonbinary is not a contradiction.'
where slug = 'man' and status = 'active'
  and long_description like 'A man is an adult human being who identifies as male%';

-- ── Group B ────────────────────────────────────────────────────────────────

update public.unified_tags set
  short_description = 'A historic theatre still in use as a venue.',
  long_description =
'An old theatre used as a venue is a surviving playhouse or music hall — often listed, often restored — hosting drag, cabaret, club nights and touring shows alongside whatever its original programme was.

The practical notes are usually about the building rather than the night: a historic auditorium tends to have stairs and no lift, narrow doors, fixed seating and limited accessible toilets, and listed-building status can be the reason none of that has been changed. Check access before travelling rather than assuming.'
where slug = 'old-theatre' and status = 'active'
  and long_description like 'The Old Theatre is a historic theatre located in Stamford%';

-- ── Group C: the citing sentence removed, every other sentence byte-identical ─

update public.unified_tags set long_description =
'Pride events are gatherings to promote LGBTQ+ visibility, equality, and unity. They often include parades, rallies, and festivals. These events are typically held annually and may commemorate significant dates in LGBTQ+ history.'
where slug = 'pride-events' and status = 'active'
  and long_description like '%According to a scientific article published on 2 March 2022%';

update public.unified_tags set long_description =
'Gay men are men who are emotionally, romantically, or sexually attracted to other men. Gay men can be found in all parts of the world and come from diverse backgrounds.'
where slug = 'gay-men' and status = 'active'
  and long_description like '%According to various sources, including a book by%';

update public.unified_tags set long_description =
'Workplace equality refers to the creation of an inclusive environment where LGBTQ+ employees feel safe and valued. This can be achieved through policies and practices that promote diversity and prevent discrimination. By implementing these policies, organizations can ensure equal opportunities and treatment for all employees, regardless of their sexual orientation or gender identity.'
where slug = 'workplace-equality' and status = 'active'
  and long_description like '%A scientific article published in 2007 highlights the importance%';

do $verify$
declare
  v_bad int; v_n int; v_note text;
begin
  -- HARD: every defect this file exists to remove is gone. Tests for the WRONG
  -- text, so a better fix written by someone else also satisfies it.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (   (slug='identity'   and (short_description = 'Concept of self and group affiliation'
                                  or long_description like 'Identity refers to the concept of self and group affiliation%'))
          or (slug='solidarity' and long_description like '%Polish trade union federation Solidarity%')
          or (slug='awareness'  and (short_description = 'Awareness of facts and information'
                                  or long_description like 'Awareness refers to the mental possession of information or skills%'))
          or (slug='dyke'       and long_description like 'The term ''Dyke'' can refer to a family name%')
          or (slug='man'        and long_description like 'A man is an adult human being who identifies as male%')
          or (slug='old-theatre' and (short_description = 'Historic theatre in Stamford'
                                   or long_description like 'The Old Theatre is a historic theatre located in Stamford%')));
  if v_bad > 0 then
    raise exception 'round five: % wrong-subject row(s) still publish the disowned prose', v_bad;
  end if;

  -- HARD: no row anywhere in this file still cites its own source to the reader.
  -- Deliberately corpus-wide over the nine, not just Group C -- a replacement
  -- body that reintroduced the register would otherwise pass unnoticed.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and slug in ('identity','solidarity','awareness','dyke','man','old-theatre',
                  'pride-events','gay-men','workplace-equality')
     and (long_description ilike '%according to a scientific article%'
       or long_description ilike '%according to various sources%'
       or long_description ilike '%a scientific article published%'
       or long_description ilike '%as listed on wikidata%'
       or long_description ilike '%the provided sources%');
  if v_bad > 0 then
    raise exception 'round five: % row(s) still cite their own source to the reader', v_bad;
  end if;

  -- The corpus convention is real newlines inside the quoted string
  -- (20261007120000). `like ''%\n%''` cannot test this -- in a LIKE pattern the
  -- backslash is the ESCAPE character, so that pattern means "contains the
  -- letter n" and matches everything; that is the defect 50900101100000 shipped
  -- and caught on its own dry run. position() is what actually asserts it.
  select count(*) into v_n from public.unified_tags
   where status = 'active'
     and slug in ('identity','solidarity','awareness','dyke','man','old-theatre',
                  'pride-events','gay-men','workplace-equality')
     and (position('\n' in coalesce(long_description,'')) > 0
       or position('\n' in coalesce(short_description,'')) > 0);
  if v_n > 0 then
    raise exception 'round five: % row(s) carry a literal backslash-n instead of a newline', v_n;
  end if;

  -- HARD: every row this file touches must still be publishable. All nine are
  -- active and indexable, and enforce_tag_thin_page_gate reads
  -- tag_has_prose(description, short_description) only.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and slug in ('identity','solidarity','awareness','dyke','man','old-theatre',
                  'pride-events','gay-men','workplace-equality')
     and not tag_has_prose(description, short_description);
  if v_bad > 0 then
    raise exception 'round five: % row(s) fell below the thin-page gate', v_bad;
  end if;

  -- REPORTS: `description` is the evidence for Group A and is never written
  -- here. A row edited elsewhere is reported, never an error.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and ((slug='identity'   and description is distinct from 'Relates to an individual''s sense of self, including their gender identity, sexual orientation, and personal characteristics.')
       or (slug='awareness'  and description is distinct from 'Raising consciousness about issues')
       or (slug='dyke'       and description is distinct from 'Reclaimed term for masculine lesbian'));
  if v_bad > 0 then
    raise notice 'round five: % description(s) differ from the evidence this file read (edited elsewhere; not an error)', v_bad;
  end if;

  -- REPORTS: the editorial questions this file deliberately does not answer.
  if exists (select 1 from public.unified_tags
              where slug = 'dyke' and status = 'active' and seo_indexable and not is_adult) then
    raise notice 'round five: dyke stays indexable and unflagged -- the house convention for reclaimed slurs (faggot, shemale, breeder) is is_sensitive + is_adult + seo_indexable=false. Whether dyke belongs in that cohort is an editorial call, not a prose fix.';
  end if;

  select string_agg(slug, ', ' order by slug) into v_note
    from public.unified_tags
   where status = 'active' and slug in ('diversity','teacher','priest','acolyte','angel','frog','goat',
                                        'villain','devotee','humiliation','ice-cream','tapas');
  if v_note is not null then
    raise notice 'round five: deliberately untouched (a filing question, or the generic-sense cohort whose own description AGREES with its body): %', v_note;
  end if;

  raise notice 'round five: 9 rows in 3 classes. Round four''s "the head is worked out" held for the top twenty and NOT as a general claim -- re-reading the whole surviving list rather than the usage head found identity at 541 uses. A hit rate measured over one ordering does not transfer to another.';
end $verify$;
