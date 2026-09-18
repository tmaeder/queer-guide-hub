-- A build note published as the definition, on 68 indexable pages -- and the note
-- is also the thing that published them
--
-- /tags/musician, /tags/families, /tags/students and 65 others open with, in full:
--
--     "Vocabulary concept folded from the professions catalog (P5)."
--
-- That is an internal provenance marker naming a migration phase and a lookup
-- table. It is the WHOLE of `description` on all 68 rows, and all 68 carry a NULL
-- `short_description` and an empty `long_description`, so it is the only text on
-- the page. It is the definition a reader meets first on /tags/:slug, and
-- `functions/_lib/detail.ts` selects the same column, so a crawler gets it too.
--
-- THE NOTE IS NOT MERELY OCCUPYING THE DEFINITION SLOT -- IT IS WHAT PUBLISHED
-- THE PAGES, and that is the finding. The causal chain is on the record, one
-- link at a time:
--
--   1. 20260725170000_silo_fold_concepts created these 68 rows, and its own
--      header states the intent: "Concepts are non-indexable (seo_indexable=
--      false, no SEO surface) and human_reviewed=true so the nightly unused-tag
--      prune never reaps this curated vocabulary." The INSERT writes
--      seo_indexable=false. The note was a provenance marker, never reader copy.
--   2. `run_tag_thin_page_reindex`'s re-index arm restores any active row that
--      "has prose", and prose is `tag_has_prose(description, short_description)`
--      -- an OR over non-emptiness. It cannot tell a definition from a
--      provenance note, because nothing in the column says which it is.
--   3. On 2026-08-23 that arm flipped all 68 to seo_indexable=true in a single
--      write (actor `job:tag_thin_page_reindex`, one timestamp, 68 distinct
--      tags), reversing the fold author's explicit decision. The note qualified
--      them.
--   4. 20261030100000 then HARDENED that arm -- it now requires
--      `seo_deindex_reason = 'thin'` and default-denies an unrecognised reason.
--      Its own comment records the sibling incident: "on 2026-08-30 this arm
--      republished 82 pages that a migration had deindexed for carrying
--      verbatim-copied prose, and 169 corpus-wide."
--   5. THE SEAL DID NOT RETRACT WHAT THE JOB HAD ALREADY PUBLISHED. Measured:
--      of the 176 rows flipped on 2026-08-30, only 23 are still indexable and
--      NONE carries a build note -- that cohort was cleaned up. Of the 75
--      flipped on 2026-08-23, 68 are still indexable and all 68 are this
--      cohort. It was sealed and never swept.
--
-- This is the rule CLAUDE.md already states twice, on a third mechanism:
-- nulling the identifier does not unpublish the prose it produced, and a fix to
-- a shared helper has not fixed the surfaces that read the helper's INPUTS.
-- Here: sealing the reindex job did not re-deindex the pages it had wrongly
-- indexed.
--
-- WHY NULL AND NOT REWRITE. Writing 68 definitions is authoring content, which
-- is the LLM rewrite both auto-apply paths were retired for after the prose
-- judge retracted 16 of its first 18 rows with 13 of them wrong. The precedent
-- is exact: 20261012090000 nulled 175 "No information available" stamps on the
-- stated ground that a stamp reads as content and defeats both
-- `indexable_without_description` and the thin-page deindexer, while a blank is
-- honest and self-heals. A provenance note is that same defect wearing a
-- different string.
--
-- THIS FILE DOES NOT WRITE `seo_indexable`, DELIBERATELY. `trg_tag_thin_page_gate`
-- is BEFORE INSERT OR UPDATE **OF description, short_description, seo_indexable,
-- status, merged_into_id** -- read off pg_get_triggerdef, not assumed, because a
-- column-scoped trigger fires on the columns named in the STATEMENT and this
-- UPDATE names `description`. So nulling the note makes `tag_has_prose` false
-- and the existing gate sets seo_indexable=false and stamps
-- seo_deindex_reason='thin' itself. The end state is reached by the mechanism
-- that owns it rather than by this file hand-writing a flag.
--
-- 'thin' IS ALSO THE CORRECT REASON, not just the automatic one: it is precisely
-- the value the hardened re-index arm WILL reverse. So if anyone later writes a
-- real definition for `musician`, the page republishes on its own. Stamping any
-- other reason would make this a one-way door and require a manual flag flip for
-- every future description -- the failure that arm's own comment exists to
-- prevent.
--
-- NOTHING IS ARMED FOR DELETION, checked rather than assumed. `deprecate_unused_tags()`
-- selects `status='active' AND human_reviewed=false AND usage_count=0` and reads
-- no prose column at all, so nulling a description cannot feed it. All 68 rows
-- are human_reviewed=true (the fold set it for exactly this reason), so 0 of 68
-- are in its selection set before or after this file. That function also has no
-- cron. This is the check that stopped 20261211100000 arming the deletion of six
-- real glossary terms, run again here.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING on this tranche: all 68 rows are
-- human_reviewed=true, and `log_unified_tag_change()` RAISEs when an undeclared
-- `system:%` actor modifies such a row. Verified live rather than assumed --
-- the undeclared UPDATE returns "human_reviewed tag ... cannot be modified by
-- system:trigger".
--
-- SEARCH: `trg_search_documents_tag` is column-scoped and DOES include
-- `description`, so these 68 rows reindex. That is correct and wanted -- the
-- facet text should stop being a migration note. `name` is also in that list, so
-- the rows keep a searchable name rather than going blank.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. The UPDATE is content-guarded
-- on the note's own text, so it no-ops row-by-row if another session repairs one
-- first, and the postconditions are keyed on the DEFECT and on the invariant --
-- never on this file's own wording or its own row count -- so a concurrent
-- better fix (someone writing a real definition) satisfies them too.
--
-- DELIBERATELY NOT DONE, each with the reason it cannot be reached here:
--   * The 23 rows still indexable from the 2026-08-30 flip. They carry REAL
--     descriptions, so each needs reading; an indexable row with a real
--     description is not prima facie wrong and a blanket sweep would be the
--     over-reach this series refuses.
--   * The 23 descriptions truncated at exactly 500 chars (counted by
--     tag_prose_standard_signals().truncated_description). Re-verified here
--     rather than inherited: 0 of 23 have a recoverable copy -- no
--     long_description shares their opening, and across 446 tag_change_log rows
--     for those tags not one carries a `description` longer than 500 chars. All
--     23 tags were created 2026-02-23 in one import and all 23 already carried
--     the truncated value in their first logged row, and there has been no
--     truncating write in 60 days. The cohort is frozen and the text never
--     existed here in full, so 99700101100000's count-do-not-repair decision is
--     correct; repairing it means regenerating content.
--   * The tag-collision cohort. Re-derived live it is 36 groups, not the 12
--     recorded earlier, and it splits three ways: genuine spelling duplicates
--     (gas-mask/gas-masks, nightlife/night-life, queer-friendly/queerfriendly),
--     FALSE twins that are different concepts (pet the kink role vs pets, filed
--     Family & Parenting and publishing "Medical imaging technique"), and -- the
--     reason a naive despace+stem merge must never be run -- the `mat-`,
--     `color-`, `occ-`, `genre-` and `news-` NAMESPACES, which are real facet
--     vocabularies (mat-leather 2,075 uses, mat-spandex 4,092, news-sports
--     2,578) and not duplicates of the glossary terms they collide with.
--     Merging those would destroy roughly 16,000 facet assignments. That pass
--     needs a per-pair direction decision and belongs in its own change.
--
-- RENUMBERED 99800101100000 -> 99910101100000. Not a collision and not another
-- session on this backlog: #3772 and #3780 merged while this PR sat in review and
-- landed `99900101100000` / `99900101100100` (marketplace taxonomy and an ingest
-- fix), both of which sort ABOVE the original version. `db push` aborts on the
-- first file sorting below the remote max(version) and takes every migration
-- queued behind it, so the move is mandatory and free. The ceiling is a property
-- of the REPOSITORY, not of this backlog -- re-read max(version) from
-- schema_migrations immediately before every push, not once at authoring time,
-- and expect it to have moved even when nobody else is working on this table.
-- The version string lives in the filename plus three refs in the guard test and
-- NOWHERE in this file's body: nothing here stamps `migration:<version>`, so a
-- rename cannot silently desynchronise a postcondition from what it counts.
--
-- Guarded by src/lib/__tests__/tagProseBuildNoteAsDefinition.test.ts, mutation-tested
-- 14/14 with a comment-only control that correctly SURVIVES -- and one mutation
-- SURVIVED the first round and was a real gap, for the reason this file keeps
-- recording: restating `tag_has_prose` as an AND inside PC2 left the assertion
-- `verify contains public.tag_has_prose(` green, because PC3 calls it too, and the
-- negative regex was written without the table alias the joined query uses
-- (`t.description ...`). Both checks are scoped now -- the call is COUNTED (2) and
-- the alias is optional. Assert the occurrence you mean, not that the string
-- appears somewhere in the block.

begin;

select set_config('app.actor', 'admin:tag-prose-build-note-as-definition', true);

-- One statement, content-guarded on the note itself. seo_indexable is NOT in the
-- SET list: the gate owns it.
update public.unified_tags
   set description = null
 where status = 'active'
   and description ~ 'Vocabulary concept folded from the .* catalog \(P5\)\.';

do $verify$
declare
  v_bad   int;
  v_total int;
begin
  -- 1. The defect is gone corpus-wide. Keyed on the note, not on a slug list, so
  --    a row another session repaired first also satisfies it.
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active'
     and description ~ 'Vocabulary concept folded from the .* catalog \(P5\)\.';
  if v_bad <> 0 then
    raise exception 'build note still published as a definition on % active tag(s)', v_bad;
  end if;

  -- 2. POSITIVE, and concurrency-safe: every active folded concept either has
  --    real prose or is deindexed under the reason the re-index arm can reverse.
  --    Counting rows in a BAD state would return zero for a cohort that had
  --    vanished, which is the vacuous form this series keeps re-learning.
  select count(*) into v_total
    from public.silo_fold_audit a
    join public.unified_tags t on t.id = a.tag_id
   where t.status = 'active';

  select count(*) into v_bad
    from public.silo_fold_audit a
    join public.unified_tags t on t.id = a.tag_id
   where t.status = 'active'
     and ( public.tag_has_prose(t.description, t.short_description)
           or (t.seo_indexable = false and t.seo_deindex_reason = 'thin') );
  if v_bad <> v_total then
    raise exception 'folded concepts not settled: % of % are neither prose-bearing nor deindexed-thin',
      v_total - v_bad, v_total;
  end if;

  -- 3. The gate's own corpus-wide invariant still holds. This is what proves the
  --    BEFORE trigger fired on a description-only UPDATE rather than being
  --    scoped past it; it read 0 before this file and must read 0 after.
  select count(*) into v_bad
    from public.unified_tags
   where status = 'active' and merged_into_id is null and seo_indexable
     and not public.tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception '% active indexable tag(s) now have no prose at all', v_bad;
  end if;

  -- 4. MIRROR, on rows OUTSIDE the pass: "the notes are gone" is equally
  --    satisfied by a sweep that took everything, so assert real glossary prose
  --    survived and stayed published.
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('aftercare', 'chosen-family', 'consent')
     and status = 'active'
     and description is not null
     and btrim(description) <> ''
     and seo_indexable;
  if v_bad <> 3 then
    raise exception 'control rows damaged: only % of 3 kept their description and index status', v_bad;
  end if;
end
$verify$;

commit;
