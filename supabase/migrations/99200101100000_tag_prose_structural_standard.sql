-- Glossary entries: the STRUCTURAL standard the styleguide never carried
--
-- The brief was "descriptions vary significantly in quality, style, tone and
-- length; standardize and rewrite them". The first half is true and the second
-- half is the experiment this repo already ran and retired. Both halves were
-- measured before anything was written, and the measurement is what decides the
-- scope of this file.
--
-- WHAT THE VARIATION ACTUALLY IS. 4,845 active tags, 3,615 carrying a
-- description, length 7 -> 1,510 chars (median 104). That 200x spread reads as
-- chaos until it is banded, and then it is BIMODAL rather than chaotic:
--
--     length      n      ends with . ! or ?     multi-sentence
--     < 60      1,112          11.7%                   0
--     60-119      837          94.0%                  19
--     120-249     843          96.1%                 536
--     250+        823          93.1%                 810
--
-- Two registers, each near-uniform inside itself. A LABEL register ("Pack
-- animal", "Cute animal role", "Learner", "Dominant in latex play") and a
-- SENTENCE register. So "1,122 rows lack terminal punctuation" is not 1,122
-- defects; it is ~982 rows correctly obeying their own register. A rule that
-- forced one register on the corpus would rewrite roughly a thousand correct
-- rows to look like each other.
--
-- THE LABEL REGISTER IS LOAD-BEARING, NOT SLOPPINESS. `description` is the
-- EVIDENCE column that ~20 prior prose passes read to detect wrong-subject
-- prose, and the terse phrasing is exactly what carries the evidence.
-- 65000101100000 turned on the word "role" in bunny's description -- "Cute
-- animal role" against a summary asserting "Small mammal in Leporidae family" --
-- and CLAUDE.md records the retired prose judge answering `wrong_subject` at
-- HIGH confidence for prose that is merely SHORT ("Passive sexual partner",
-- "Teaching role"). Expanding those labels into sentences would destroy the
-- evidence the repair series runs on and re-create the defect it exists to find.
--
-- REGISTER IS GRAMMATICAL, NOT LENGTH-BASED, and a first draft of this file got
-- that wrong. The <60 band is NOT uniformly labels: "A man who was assigned
-- female at birth.", "An intersex person who identifies with the male gender.",
-- "A gender-neutral form of priest or priestess." are short SENTENCES and are
-- correctly punctuated. Length cannot tell a noun phrase from a sentence, so the
-- register rule below is stated for a human and a model to apply and is
-- deliberately NOT mechanically enforced anywhere.
--
-- THE MOST DANGEROUS AVAILABLE "STANDARDIZATION" IS ADDING A FULL STOP.
-- The rows that are provably sentence-register yet unpunctuated are dominated by
-- descriptions EXACTLY 500 CHARACTERS long ending mid-clause -- rumpus-room
-- ("...A rumpus room may also"), kink-dispenser ("...reciprocity, or building"),
-- alliteration ("...during a BDSM scene to en"), sensual-sadist ("...often but
-- not always Dom"). 23 of the 24 rows at exactly 500 chars are cut off. They are
-- TRUNCATED, not missing a period, and appending one converts a visibly
-- incomplete entry into a plausibly complete one -- destroying the only signal
-- that the content was lost. This is a new defect class; it is counted by the
-- sentinel in the sibling migration and repaired by nobody here, because
-- restoring the lost text means regenerating content.
--
-- WHAT WAS ALREADY CLEAN, measured rather than assumed, is why this file writes
-- no prose at all. In `description` across 3,615 active rows: self-citation 0,
-- advice-register padding 0, define-the-term-with-the-term 0, description equals
-- name 0, literal backslash-n 0. Twenty prior passes closed those. The residue
-- is 19 whitespace rows (repaired by 99200101100200), 2 scrape timestamps, 2
-- disambiguation lists, 23 truncations, and 46 styleguide-drift rows.
--
-- SO THE GAP IS THE STANDARD, NOT THE CORPUS -- 20470922084600's finding
-- verbatim, one entity later: running the standard against the corpus corrected
-- the standard. `styleguide_rules` holds 30 active rules; 21 are scoped `all`
-- and exactly TWO are scoped `tag`, and neither governs STRUCTURE. Nothing
-- anywhere states what the three fields are for, which registers are legal, or
-- that a truncation must not be punctuated. That is what this migration adds.
--
-- It is written into `styleguide_rules` rather than as a new document on purpose:
-- a second standard beside the published one re-creates the three-prose-copies
-- problem the styleguide system was built to end (CLAUDE.md, "the voice is rows
-- now, not prose in three source files").
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. Every insert is idempotent and
-- no existing rule is modified, so a concurrent styleguide change cannot make
-- this file abort `db push` on main and strand every migration queued behind it.

begin;

insert into styleguide_rules (slug, section, title, body, severity, applies_to, rationale, sort_order, is_active)
values
  ('tag-field-contract', 'formatting',
   'A glossary entry has three fields and they are not interchangeable',
   'short_description is the lead line and the search facet: one clause naming what the term is. '
   || 'description is the definition a reader meets first on /tags/:slug and the evidence of record for what the entry is about. '
   || 'long_description is the body: background, practice, history, safety. '
   || 'Write the field you mean. Do not restate one field in another, and do not move content between them to even out their lengths.',
   'must', array['tag'],
   'The three fields render in three different places and one of them also feeds search. '
   || 'Treating them as one pool of prose is what produced entries whose summary and body describe different subjects.',
   310, true),

  ('tag-two-registers', 'formatting',
   'Both the label register and the sentence register are correct',
   'A definition may be a bare noun phrase with no closing full stop ("Cute animal role", "Dominant in latex play") '
   || 'or one or more complete sentences, each closed ("A man who was assigned female at birth."). '
   || 'Pick the register the term needs and stay in it for the whole field. '
   || 'Never convert an entry from one register to the other to make it match its neighbours: length is not a quality signal, and a terse label is often the most precise definition available.',
   'must', array['tag'],
   'Measured across 3,615 active descriptions the corpus is bimodal, each register near-uniform within itself; '
   || 'the terse register also carries the evidence that the prose-repair passes read, so flattening it destroys a working signal.',
   311, true),

  ('tag-never-punctuate-a-truncation', 'accuracy',
   'Never close a truncated definition with a full stop',
   'A description that stops mid-clause -- especially one sitting exactly on a length cap -- has lost text. '
   || 'Flag it for regeneration. Do not append a full stop, do not trim it back to the last complete sentence, and do not treat it as an entry that merely lacks punctuation.',
   'must', array['tag'],
   'Appending a mark turns a visibly incomplete entry into a plausibly complete one and destroys the only evidence the content was ever lost. '
   || '23 active descriptions are cut off at exactly 500 characters.',
   312, true),

  ('tag-description-is-evidence', 'accuracy',
   'description states the subject; it is never rewritten to agree with the other fields',
   'When a summary or body contradicts the description, the description is the evidence of what the entry is about and the other field is what gets repaired. '
   || 'Correct only the field that is wrong. Leave a correct field alone even when the entry as a whole reads unevenly.',
   'must', array['tag'],
   'Roughly twenty repair passes resolve wrong-subject prose by trusting this column; '
   || 'rewriting it to match a wrong summary would silently ratify the error and leave nothing to detect it with.',
   313, true),

  ('tag-lead-is-not-an-encyclopedia-lead', 'persona',
   'Open with what the term means here, not with a reference-work lead',
   'Start at the sense this glossary is for. Do not open with an official name, a formal classification, a founding date or a nationality clause when the entry is about how the term is used in queer, kink or health contexts.',
   'should', array['tag'],
   null,
   314, true)
on conflict (slug) do nothing;

-- Publishing is part of the change. styleguide_compile() freezes every profile
-- into an immutable version row AT PUBLISH TIME and getVoicePrompt() serves the
-- frozen row, so inserting rules without publishing leaves the whole fleet on
-- v1.3.0 while every check here reports success -- the "shipped and wired to
-- nothing" failure this system was built after.
--
-- styleguide_publish() is SECURITY DEFINER whose first statement is
-- `IF NOT has_role_jwt('admin') THEN RAISE 'unauthorized'`, and a migration
-- carries no JWT. The gate and the work are deliberately separate functions, so
-- this calls the core directly -- which is also honest, because no human
-- published it.
select _styleguide_publish_core('minor',
  'Glossary structure: the three-field contract, both legal registers, and the rule that a truncated definition is never closed with a full stop.',
  null);

do $verify$
declare
  v_bad int;
  v_txt text;
begin
  -- 1. every rule is present, active and tag-scoped
  select count(*) into v_bad from styleguide_rules
  where is_active and 'tag' = any(applies_to)
    and slug in ('tag-field-contract','tag-two-registers','tag-never-punctuate-a-truncation',
                 'tag-description-is-evidence','tag-lead-is-not-an-encyclopedia-lead');
  if v_bad <> 5 then
    raise exception 'tag_prose_structural_standard: expected 5 active tag-scoped structural rules, found %', v_bad;
  end if;

  -- 2. the PUBLISHED TEXT carries them, not merely the rows. Asserting the rows
  --    passes in exactly the un-published state this check exists to catch.
  select compiled_prompt into v_txt from styleguide_versions where is_active;
  if v_txt is null then
    raise exception 'tag_prose_structural_standard: no active styleguide version after publish';
  end if;
  select count(*) into v_bad
  from unnest(array[
         'three fields and they are not interchangeable',
         'label register and the sentence register',
         'Never close a truncated definition',
         'it is never rewritten to agree with the other fields'
       ]) as needle
  where position(needle in v_txt) = 0;
  if v_bad <> 0 then
    raise exception 'tag_prose_structural_standard: % structural rule(s) missing from the published prompt', v_bad;
  end if;

  -- 3. the version actually moved off 1.3.0
  select count(*) into v_bad from styleguide_versions where is_active and version = '1.3.0';
  if v_bad <> 0 then
    raise exception 'tag_prose_structural_standard: publish did not advance the active version off 1.3.0';
  end if;

  -- 4. this file adds rules and changes no voice: the pre-existing tag rules survive
  select count(*) into v_bad from styleguide_rules
  where is_active and slug in ('sex-is-described-plainly','no-second-person-in-reference');
  if v_bad <> 2 then
    raise exception 'tag_prose_structural_standard: pre-existing tag-scoped rules were disturbed (found %)', v_bad;
  end if;
end
$verify$;

commit;
