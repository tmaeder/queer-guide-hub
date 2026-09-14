-- Glossary prose round six: the disowned-prose TAIL, reduced to what a
-- concurrent session left standing.
--
-- HOW THESE WERE FOUND, because the method is the transferable part. Rounds two
-- to five worked the backlog in USAGE ORDER and stopped where the usage ran
-- out. That ordering is why these rows survived five passes: almost every one
-- is usage 0, so it sorted below everything anyone ever read. Searching the
-- surviving set for the SIGNATURES the earlier rounds had already found by hand
-- -- "family name", "commune in", "studio album", "genus", "may refer to",
-- "according to Wikidata" -- returned 57 rows in six shapes, and hand-reading
-- those 57 produced 25 repairs. **A signature is not a defect**: `boyfriend`
-- matched on "can refer to a wide range of relationships", which is ordinary
-- correct prose, and `frog`, `goat`, `tiger`, `duck`, `dragon`, `bunny` and
-- `strawberry` matched the species arm while being the deferred generic-sense
-- cohort. The regex narrows what a human reads; it does not decide.
--
-- ── SIXTEEN OF THOSE 25 WERE REPAIRED UNDER THIS FILE WHILE IT SAT IN REVIEW ─
-- 51700101143000_tag_prose_namesake_artifacts (a concurrent session, merged and
-- APPLIED to prod while this branch was open) repaired `collar`, `humbler`,
-- `bottom`, `babyboy`, `doe`, `handler`, `minion`, `tickler`, `whipper`,
-- `vixen`, `domme`, `fister`, `sissy`, `servant`, `knife-play` and
-- `business-suits` -- by the same rule, from the same evidence, to prose that
-- is correct. Two sessions found one seam from opposite ends, which is the
-- `queerness`/`queer-theory` shape (20360401100100) for the third time.
--
-- **The overlapping UPDATEs are DELETED rather than left to no-op.** They are
-- content-guarded, so leaving them would have been harmless at run time -- but
-- a file that claims 25 rows and changes 9 misreports itself to the next
-- reader, and re-writing correct prose is the LLM rewrite both auto-apply paths
-- were retired for. What is left is the 9 rows that measurably still carry the
-- disowned prose, re-measured against prod rather than assumed from the diff.
--
-- The POSTCONDITIONS are deliberately NOT narrowed to match. They were already
-- written against the WRONG text rather than against this file's own writes --
-- "so a better fix by someone else also satisfies it" -- so they now assert the
-- whole 25-row seam is clean, ours and theirs together, and would catch a
-- regression in either. That is the soft-on-preconditions, hard-on-
-- postconditions rule doing exactly the work it exists for.
--
-- ── THE CLASS THIS FILE FOUND: A HALF-REPAIRED ROW ─────────────────────────
-- `queerness` (20360401100300) taught that nulling an identifier does not
-- unpublish the prose it produced. This is that lesson one layer further in:
-- **repairing one PROSE FIELD does not repair the other, and the result is
-- invisible to any check that reads either field alone.** `collar` was the
-- clearest case -- `description` and `long_description` both careful
-- hand-written kink prose, while `short_description`, the LEAD LINE on the
-- page, still read "Family name or surname". Someone fixed two fields of
-- three. It is repaired upstream now; `gainer`, `possum` and `toy` below are
-- the same shape and are not.
--
-- ── THE RULE IS UNCHANGED ──────────────────────────────────────────────────
-- Repair only where the row's own `description` establishes a sense the
-- short/long description contradict, or -- the widening of 51500101152700 --
-- where the CATEGORY admits exactly one reading of the tag's own name. Never
-- "pick the most likely sense". `description` is NEVER written: it is the
-- evidence that justified the change, and overwriting it destroys the warrant.
--
-- ── GROUP A — the SUMMARY is the surviving junk; description and body are good ─
-- `gainer`  "Surname or rare term" over a row whose description is feedism
--           vocabulary. Summary only.
--
-- ── GROUP B — the BODY is the surviving junk; description and summary are good ─
-- `toy`      body is a children's-entertainment definition.
-- `possum`   body is 400 characters on the Virginia opossum, Didelphis
--            virginiana, on a pet-play row whose summary is already correct.
-- `monsieur` body is the honorific as borne by the eldest living brother of the
--            King of France.
-- `triad`    body is correct and then closes on a 1988 studio album.
--
-- ── GROUP C — BOTH fields junk and the description is THIN: MINT NOTHING ────
-- `fae`, `flock`, `cunt` carry a real but one-line `description` -- enough to
-- state what the tag is, not enough to write a body from. The summary is set to
-- exactly what that description supports and the body is NULLED: the queen /
-- lioness / steer treatment. Authoring a body here would be inventing kink
-- vocabulary for a 0-usage row, which is how this defect class began.
--
-- Nulling is safe and is ASSERTED, not assumed: enforce_tag_thin_page_gate
-- reads tag_has_prose(description, short_description) only, and all three keep
-- a description. `long_description` is also NOT in trg_search_documents_tag's
-- column list, so a body-only repair causes zero search churn.
--
-- ── GROUP D — BOTH fields junk, description establishes a KNOWN sense ───────
-- `masc` is the sharpest row in the whole backlog and the reason this group was
-- not deferred: its own description reads "A masculine gender expression,
-- REGARDLESS OF GENDER IDENTITY" and the body published biological sex -- "a
-- male is an organism that produces sperm" -- which is precisely the claim that
-- description exists to refuse.
--
-- ── NOT REPAIRED, named so the next pass does not re-read them ──────────────
-- `ebony`, `bicon`   no clean evidence on the row. bicon's `description` is
--                    ITSELF a disambiguation list, and this file never writes
--                    `description`, so it is unrepairable under the rule rather
--                    than overlooked.
-- `host`, `unicorn`  name TWO senses at once ("Mythical creature or third
--                    person"). Choosing is the guess this class came from.
-- the generic-sense cohort, fourth pass running (`teacher`, `priest`,
--                    `acolyte`, `frog`, `goat`, `lamb`, `lord`, `squire`,
--                    `reynard`, `cousin`) -- each row's `description` AGREES
--                    with its body, so the rule structurally cannot reach them.
--
-- All 9 rows are human_reviewed, so the actor declaration is LOAD-BEARING, not
-- attribution: log_unified_tag_change() RAISEs "human_reviewed tag <uuid>
-- cannot be modified by system:trigger" for an undeclared system actor.

select set_config('app.actor', 'admin:tag-prose-disowned-tail', true);

-- ── Group A: summary only ──────────────────────────────────────────────────

update public.unified_tags set short_description = 'Someone who intentionally gains weight, as a preference or an identity within feedism.'
 where slug = 'gainer' and status = 'active' and short_description = 'Surname or rare term';

-- ── Group B: body only ─────────────────────────────────────────────────────

update public.unified_tags set long_description =
'Being someone''s toy is an objectification role: for the length of a scene a person is treated as a thing to be used, arranged or played with rather than consulted.

It only works as a negotiated dynamic, and the negotiation is what separates it from simply being disregarded. Limits and a way to stop are agreed first, precisely because the role involves acting as though the person has set them aside.'
 where slug = 'toy' and status = 'active'
   and long_description like 'A toy is an object used primarily for entertainment%';

update public.unified_tags set long_description =
'Possum is a pet-play persona built on the possum rather than the more common dog or cat — playing dead, hanging about, being nocturnal and a bit feral.

Pet play is a headspace rather than a costume, though gear often helps. Like the other animal personas it can be sexual or entirely not, and which it is depends on the people involved rather than on the animal.'
 where slug = 'possum' and status = 'active'
   and long_description like 'The Virginia opossum is a solitary, nocturnal mammal%';

update public.unified_tags set long_description =
'Monsieur is a French honorific used to address a masculine dominant, in the same position as Sir but with a more formal and deliberately elegant register.

It belongs to protocol rather than to French nationality: people use it in high-protocol dynamics and in scenes with an aristocratic flavour, and like any title it is one the dominant is given rather than one they simply announce.'
 where slug = 'monsieur' and status = 'active'
   and long_description like 'Monsieur is a French honorific title that was historically used%';

update public.unified_tags set long_description =
'A triad is a relationship between three people. In a closed triad all three are involved with each other; in a vee one person is involved with two who are not involved with one another.

It is a structure, not a hierarchy — the three do not automatically hold equal weight, and saying so openly is how triads avoid the most common failure, where an existing couple treats a third person as an accessory to their relationship rather than a partner in their own right.'
 where slug = 'triad' and status = 'active'
   and long_description like '%In music, Triad is also the name of a 1988 studio album%';

-- ── Group C: summary from the row's own description; body NULLED, nothing minted ─

update public.unified_tags set short_description = 'A fae or fairy-creature role.', long_description = null
 where slug = 'fae' and status = 'active' and short_description = 'Fae, a given name';

update public.unified_tags set short_description = 'A group of connected individuals.', long_description = null
 where slug = 'flock' and status = 'active' and short_description = 'Family name or social group term';

update public.unified_tags set short_description = 'A vulgar term used for a submissive.', long_description = null
 where slug = 'cunt' and status = 'active' and short_description = 'External female genital organs';

-- ── Group D: the description establishes a known sense ─────────────────────

update public.unified_tags set short_description = 'A masculine gender expression, whoever is wearing it.', long_description =
'Masc describes a masculine gender presentation — how someone dresses, moves, speaks and is read — and it says nothing about their gender identity or their body.

Masc people include cis and trans men, butch and masc-of-centre lesbians, nonbinary people and plenty of others, and the word is a description of expression rather than a claim about anatomy. It is also a scale rather than a category: people are masc-of-centre, masc-leaning, or masc some days and not others.'
 where slug = 'masc' and status = 'active'
   and long_description like 'The term ''Masc'' refers to individuals who identify as male%';

do $verify$
declare
  v_bad int; v_n int; v_note text;
  -- The whole 25-row seam: the 9 this file repairs plus the 16 that
  -- 51700101143000 repaired under it. The checks below are deliberately scoped
  -- to the SEAM rather than to this file's own writes, so they assert the
  -- reached STATE and would catch a regression on either session's rows.
  v_seam text[] := array['collar','humbler','gainer','bottom','babyboy','toy','possum','monsieur',
                         'doe','fae','flock','handler','minion','tickler','whipper','vixen','cunt',
                         'domme','fister','sissy','servant','knife-play','business-suits','masc','triad'];
begin
  -- HARD: every defect this seam exists to remove is gone. Tests for the WRONG
  -- text, so a better fix by someone else also satisfies it -- which is exactly
  -- what happened to 16 of these rows, and is why this check still passes.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (   short_description in ('Family name or surname','Family name of origin','Surname or rare term',
                                   'Family name','Fae, a given name','Family name or social group term',
                                   'Family name or term with various meanings','A surname or electronic circuit',
                                   'Climbing term','Village in Norway','Xiu Xiu''s 2002 album','Song by Hole',
                                   'Male sex or gender identity','External female genital organs')
          or long_description like 'The term ''Bottom'' can refer to a family name%'
          or long_description like 'The term ''Babyboy'' is used on some English-language birth certificates%'
          or long_description like 'The Virginia opossum is a solitary, nocturnal mammal%'
          or long_description like 'Domme is a commune in the Dordogne%'
          or long_description like 'Sissy refers to a commune in Aisne, France%'
          or long_description like 'Servant is a commune in Puy-de-D%'
          or long_description like 'Knife Play is the debut studio album%'
          or long_description like 'Business Suits is a song by the American alternative rock band Hole%'
          or long_description like 'Vixen, also known as Dariusz Szlagor, is a Polish rapper%'
          or long_description like 'The term ''Masc'' refers to individuals who identify as male%'
          or long_description like '%In music, Triad is also the name of a 1988 studio album%');
  if v_bad > 0 then
    raise exception 'tail: % row(s) still publish the disowned prose', v_bad;
  end if;

  -- HARD: nulling a body is only safe while the row keeps prose the thin-page
  -- gate can see. Three bodies are nulled here, so this is not decorative.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_seam)
     and not tag_has_prose(description, short_description);
  if v_bad > 0 then
    raise exception 'tail: % row(s) fell below the thin-page gate', v_bad;
  end if;

  -- HARD: no row in this seam may cite its own source to the reader.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_seam)
     and (long_description ilike '%according to wikidata%'
       or long_description ilike '%according to wikipedia%'
       or long_description ilike '%as disambiguated on%'
       or long_description ilike '%the provided sources%');
  if v_bad > 0 then
    raise exception 'tail: % row(s) still cite their own source to the reader', v_bad;
  end if;

  -- The corpus convention is real newlines inside the quoted string
  -- (20261007120000). `like ''%\n%''` cannot test this -- in a LIKE pattern the
  -- backslash is the ESCAPE character, so that pattern means "contains the
  -- letter n" and matches everything; that is the defect 50900101100000 shipped
  -- and caught on its own dry run. position() is what actually asserts it.
  select count(*) into v_n from public.unified_tags
   where status = 'active' and slug = any(v_seam)
     and (position('\n' in coalesce(long_description,'')) > 0
       or position('\n' in coalesce(short_description,'')) > 0);
  if v_n > 0 then
    raise exception 'tail: % row(s) carry a literal backslash-n instead of a newline', v_n;
  end if;

  -- HARD: Group C removes a false claim and mints NOTHING. Their bodies must be
  -- null, not replaced with invented vocabulary. Six of these nine were nulled
  -- by 51700101143000 and three here; the invariant is the same either way.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and slug in ('doe','fae','flock','handler','minion','tickler','whipper','vixen','cunt')
     and long_description is not null;
  if v_bad > 0 then
    raise exception 'tail: % Group C row(s) gained a body -- that group exists to mint nothing', v_bad;
  end if;

  -- REPORTS: `description` is the evidence on every row here and is never
  -- written by this file.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_seam) and coalesce(btrim(description),'') = '';
  if v_bad > 0 then
    raise notice 'tail: % row(s) now carry no description -- this file never writes one, so that was done elsewhere', v_bad;
  end if;

  -- REPORTS: named deferrals, so the next pass can tell "left by decision" from
  -- "already fixed".
  select string_agg(slug, ', ' order by slug) into v_note
    from public.unified_tags
   where status = 'active' and slug in ('ebony','bicon','host','unicorn','lamb','lord','squire',
                                        'reynard','cousin','strawberry','frog','goat','teacher','priest','acolyte');
  if v_note is not null then
    raise notice 'tail: deliberately untouched -- no clean evidence on the row (ebony, bicon), two senses named at once (host, unicorn), or the generic-sense cohort whose description AGREES with its body: %', v_note;
  end if;

  raise notice 'tail: 9 rows repaired here; 16 of the same seam were repaired by 51700101143000 while this file sat in review, so its overlapping UPDATEs were deleted rather than left to no-op. The class this pass found is the HALF-REPAIRED row -- one prose field fixed by an earlier pass and the other left carrying the disowned junk, which no check reading a single field can see.';
end $verify$;
