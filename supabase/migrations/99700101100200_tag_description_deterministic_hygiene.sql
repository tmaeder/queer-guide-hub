-- Glossary descriptions: the repair that needs no judgement, and only that
--
-- Two classes, 21 rows, no model in the loop and no sentence rewritten. This is
-- deliberately NOT the retired experiment: tag-enrichment-sweep mode='prose' had
-- an LLM judge and rewrite, its first live batch of 18 retracted 16 rows with 13
-- of them WRONG, and both auto-apply paths are disabled. Everything below is a
-- literal, reversible string operation whose output was computed and read before
-- it was written.
--
-- CLASS 1 -- WHITESPACE, 19 rows. Leading/trailing whitespace and runs of 2+
-- spaces or tabs inside otherwise-correct prose. Not a word changes.
--
--   btrim() WITH NO CHARACTER SET TRIMS SPACES ONLY, NOT NEWLINES. A first pass
--   using bare btrim() found 12 rows and missed 7 -- every Wikipedia-derived row
--   carrying a "\n\n\n" prefix (orgasm, gender-identity, pride-parade, tokenism,
--   crimes-against-humanity). The explicit E' \t\n\r' set is load-bearing.
--
--   INTERNAL newlines are PRESERVED, and that is not incidental: paragraphsHtml()
--   in functions/_lib/detail.ts splits crawler prose on them, so collapsing them
--   would re-merge multi-paragraph entries into one blob -- the exact defect
--   6d5e8a21f fixed across 13 call sites. Verified per row by the length delta:
--   pride-parade loses 1 char (the leading \n) and keeps its paragraph break,
--   orgasm loses 3 ("\n\n\n"), gender-identity 2. Only [ \t]{2,} is collapsed,
--   never \n.
--
-- CLASS 2 -- A TIMESTAMP PUBLISHED AS A DEFINITION, 2 rows. conditions-disorders
-- and kidnapping both read, in full, "Updated June 28, 2023  3:59pmUpdated June
-- 28, 2023  3:59pm" -- the stis-stds defect, on active rows. The column is
-- NULLED rather than rewritten. That is the established answer, not a shortcut:
-- 20261012090000 nulled 175 "No information available" stamps and 38 refusal
-- essays on the finding that a stamp READS AS CONTENT and defeats both
-- indexable_without_description and the thin-page deindexer, while a blank is
-- honest and self-heals through the grounded fill paths. Writing a definition
-- here instead would be authoring prose, which is the line this work does not
-- cross.
--
--   NULLING IS SAFE AND IS ASSERTED, NOT ASSUMED: enforce_tag_thin_page_gate
--   reads tag_has_prose(description, short_description), which is an OR, and both
--   rows keep a short_description -- checked below rather than hoped for.
--
-- WHAT IS DELIBERATELY NOT TOUCHED, each for its own reason rather than for lack
-- of time:
--
--   * 23 truncated descriptions sitting on the 500-char cap. Repairing them means
--     regenerating lost text. Counted by tag_prose_standard_signals(); the new
--     rule tag-never-punctuate-a-truncation exists precisely to stop the tempting
--     fix of appending a full stop.
--   * bicon and flamer, whose descriptions are THEMSELVES disambiguation lists.
--     CLAUDE.md already records bicon as unrepairable under the rule (the
--     evidence column cannot be evidence for itself). Their trailing newlines are
--     trimmed here; their content is left exactly as it stands.
--   * basorexic carries the real typo "inlcude". Fixing spelling inside prose is
--     a judgement call about someone's wording and belongs in a pass that says so.
--   * 46 styleguide-drift rows in tag.description. The house answer to drift is a
--     counter, not a rewrite (styleguide_content_drift), and the deterministic
--     half of that -- the `vibrant` collocation sweep -- was already run.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING HERE, verified live rather than assumed:
-- 13 of the 19 whitespace rows are human_reviewed, and log_unified_tag_change()
-- RAISEs when an UNDECLARED (system:%) actor modifies such a row.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. Every UPDATE is guarded on the
-- defect it removes, so a concurrent repair of any row makes this file no-op on
-- that row instead of aborting `db push` on main and stranding the queue.

begin;

select set_config('app.actor', 'admin:tag-description-deterministic-hygiene', true);

-- CLASS 1: whitespace only. No word, and no newline, is altered.
update unified_tags u
set description = regexp_replace(btrim(u.description, E' \t\n\r'), '[ \t]{2,}', ' ', 'g')
where u.status = 'active'
  and u.description is not null
  and u.description !~* '^(updated )?[a-z]+ +[0-9]{1,2}, *[0-9]{4}'
  and u.description is distinct from
      regexp_replace(btrim(u.description, E' \t\n\r'), '[ \t]{2,}', ' ', 'g');

-- CLASS 2: a scrape timestamp is not a definition. Remove the claim; never
-- invent one. Guarded on the stamp itself, so a human who writes a real
-- definition first keeps their work.
update unified_tags u
set description = null
where u.status = 'active'
  and u.description ~* '^(updated )?[a-z]+ +[0-9]{1,2}, *[0-9]{4}'
  and u.description ~* 'updated .*(am|pm)';

do $verify$
declare
  v_bad int;
begin
  -- 1. the whitespace class is gone, corpus-wide (a zero-invariant)
  select count(*) into v_bad
  from unified_tags
  where status = 'active' and description is not null
    and (description <> btrim(description, E' \t\n\r') or description ~ '[ \t]{2,}');
  if v_bad <> 0 then
    raise exception 'tag_description_deterministic_hygiene: % row(s) still carry stray whitespace', v_bad;
  end if;

  -- 2. no timestamp is published as a definition
  select count(*) into v_bad
  from unified_tags
  where status = 'active' and description is not null
    and description ~* '^(updated )?[a-z]+ +[0-9]{1,2}, *[0-9]{4}';
  if v_bad <> 0 then
    raise exception 'tag_description_deterministic_hygiene: % row(s) still publish a timestamp as a definition', v_bad;
  end if;

  -- 3. the two nulled rows stay publishable. tag_has_prose is an OR, so this is
  --    asserted by CALLING the real predicate rather than restating it -- a
  --    hand-rolled "both fields present" form would fail on correct code.
  select count(*) into v_bad
  from unified_tags
  where slug in ('conditions-disorders','kidnapping')
    and status = 'active'
    and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception 'tag_description_deterministic_hygiene: % nulled row(s) fail the thin-page gate', v_bad;
  end if;

  -- 4. MIRROR ASSERTION: this file must not have swept content. Rows whose
  --    internal paragraph breaks carry meaning keep them -- "the whitespace is
  --    gone" is equally satisfied by a pass that flattened every newline.
  select count(*) into v_bad
  from unified_tags
  where slug = 'pride-parade' and status = 'active'
    and (description !~ '\n' or description !~ '^A pride parade is an event');
  if v_bad <> 0 then
    raise exception 'tag_description_deterministic_hygiene: pride-parade lost its paragraph break or its opening';
  end if;

  -- 5. and the disambiguation rows keep their content, trimmed but not repaired
  select count(*) into v_bad
  from unified_tags
  where slug in ('bicon','flamer') and status = 'active'
    and description !~* '^[^.!?]{0,60}(may|could) refer to\s*:';
  if v_bad <> 0 then
    raise exception 'tag_description_deterministic_hygiene: a disambiguation row was rewritten, not merely trimmed';
  end if;
end
$verify$;

commit;
