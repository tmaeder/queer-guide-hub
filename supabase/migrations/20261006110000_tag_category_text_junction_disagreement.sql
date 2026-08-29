-- The 33 tags whose `category` TEXT names a different category than their own
-- primary junction row: 21 repaired toward the text, 12 toward the junction.
-- Two origins, and they need OPPOSITE repairs.
--
-- This is the residue of 20260829072807, not a re-litigation of it. That
-- migration reconciled category_id against the junction and could not see this
-- class: its `_drift` predicate is "category_id has no matching primary
-- junction", and on every row here category_id ALREADY equals the primary
-- junction. The text column was never in its WHERE clause.
--
--
-- PART 1 — 24 ACTIVE ROWS. PROD RAN THE PRE-#3087 REVIVAL 16 MINUTES BEFORE ITS
-- OWN FIX MERGED, AND THE FIX CAN NEVER REACH THEM.
--
-- 12af05ccb ("the junction wins — repairing drift the other way reclassified 24
-- pages", #3087) rewrote the category-repair loop in kinktionary revival waves
-- 1-4. The loop it replaced read:
--
--     where not exists (primary junction matching category_id)
--     -> demote every other primary, insert category_id as primary
--
-- justified as "category_id is the canonical side". #3087 reversed that after
-- reading the renderer: `fetchTagWithCategories` (src/hooks/usePageFetchers.ts)
-- selects from tag_category_assignments, so THE JUNCTION IS WHAT THE PAGE SHOWS,
-- and rewriting it "silently reclassifies live pages — 24 of the drifted rows in
-- waves 2-4, moved off a curated child category and onto whatever parent
-- category_id happened to hold."
--
-- Those 24 pages are not hypothetical and were never repaired. Measured on prod:
--
--     2026-08-29 06:08:40 UTC   waves w3 + w4 applied (schema_migrations)
--     2026-08-29 06:24:36 UTC   12af05ccb authored
--
-- The waves were already recorded applied, so `db push` will never re-run them
-- and the corrected loop will never execute against this data. #3087 fixed the
-- source file for a run that had already happened. The 24 rows below are exactly
-- the 24 that commit measured, still carrying the regression.
--
-- WHICH SURFACE IS CURATED, MEASURED RATHER THAN ARGUED. Per row:
--
--   category_id      the PARENT, unchanged since April — the stale side
--   junction primary the PARENT, INSERTED 2026-08-29 06:08:40 by the old loop
--   junction (2nd)   the CHILD, row created 2026-04-11, demoted by that loop
--   category text    the CHILD, written 2026-08-02 by admin:tag-category-resync
--
-- `admin:tag-category-resync` is a junction -> text denormaliser (8,450 rows,
-- 2026-08-02..08-15, every one a text change). It read the junction and wrote
-- the child, which is direct evidence the CHILD held is_primary before 06:08.
-- So the text is a preserved snapshot of the correct pre-revival junction state,
-- and the primary flag is the corrupted surface.
--
-- category_id and the junction agreeing is therefore NOT two votes against one.
-- #3087's own test is "two of three signals", and it only holds when the signals
-- are independent: here the primary junction was DERIVED FROM category_id, 21
-- days after the admin set the text. One signal, counted twice.
--
-- THE REPAIR IS THE DECISION #3087 ALREADY MADE, APPLIED TO PROD. Move
-- category_id onto the category the text already names. The owned triggers do
-- the rest — trg_sync_tag_category (BEFORE) derives the text, which is already
-- that value and so does not move; trg_sync_tag_category_after demotes the stale
-- parent and promotes the existing April junction row. Nothing is invented: the
-- target row is required to already EXIST on the tag, which is what makes it
-- curated rather than guessed.
--
-- THIS DOES CHANGE 21 LIVE PAGES, and saying otherwise would be false. The tag
-- page's primary category moves parent -> child (safe-words: Safety & Practices
-- -> Consent & Negotiation; needle-top: Health & Wellness -> Sexual Health).
-- Both categories already render on the page — only which one is primary moves.
-- It restores the 2026-08-02 curation and makes the page agree with the search
-- facet, which is fed from the text column and has been showing the child all
-- along.
--
-- PART 1 IS RESTRICTED TO A STRICT PARENT -> CHILD MOVE, and that restriction is
-- load-bearing rather than tidy. #3087 describes one specific shape: rows "moved
-- off a curated child category and onto whatever PARENT category_id happened to
-- hold". 21 of the 24 are that shape. Three are not, and taking them would
-- import an unreviewed editorial change under cover of a consistency repair:
--
--   crossdresser-transvestite   Gender Identity      -> Sexual Health     (cross-branch)
--   safe-sane-and-consensual-ssc Safety & Practices  -> Slang & Terminology (cross-branch)
--   piss-slut                   Sexual Roles         -> Practices & Play  (sibling)
--
-- The first two are worse than what they would replace, not merely different:
-- filing a gender-expression term under Sexual Health pathologises it, and SSC
-- is a foundational consent framework rather than slang. Where the target is not
-- a child of what the revival substituted, the "curated child" argument simply
-- does not apply — there is no parent/child relationship to have been coarsened
-- — so these three keep the category their page shows today and are handled by
-- part 2 instead. Re-filing them is an editorial call, and it is not this one.
--
--
-- PART 2 — 12 ROWS WHERE THE JUNCTION IS THE ONLY SIGNAL LEFT, OR THE BETTER ONE.
--
-- 7 deprecated + 1 merged: the text names a category that DOES NOT EXIST in
-- tag_categories at all — `Global & Regional Rights` (3) and `Queer History by
-- Region` (4+1) are orphan strings from a category since renamed or merged.
-- category_id is NULL on all of them. There is nothing to defer to but the
-- junction, so the text adopts it.
--
-- 2 active (`golden-shower`, `deli`): pre-existing drift with no revival
-- involvement — their primary junction dates from 2026-06-07 and was never
-- touched by the waves. The resync did NOT derive their text from the primary
-- (golden-shower's text came from the junk value 'terms', deli's from NULL), so
-- the text carries no curation to protect here. Adopting the junction leaves
-- both pages exactly as they render today and only moves the search facet into
-- agreement with them.
--
-- 3 active (the cross-branch and sibling rows named above): the junction is not
-- merely the surviving signal but the better filing, so the same treatment
-- applies for a different reason. Their pages do not move.
--
-- category_id IS DELIBERATELY NOT WRITTEN IN PART 2. The 7 orphan rows sit in
-- the separate 435-row "category_id NULL while a junction exists" cohort owned
-- by 20261005100100_tag_denorm_category_resync, which repairs them at the
-- category_id level and derives this same text through the BEFORE trigger. The
-- two are idempotent in either order and converge on the same value; writing
-- category_id here would duplicate that migration's job on 7 of its rows.
--
--
-- SCOPE GUARD, NOT A FROZEN ID LIST. The predicates are structural, so a row
-- repaired by a concurrent session before this applies is simply not selected
-- rather than a hard failure — several sessions were repairing this table on
-- 2026-08-29. What is asserted is the POST-CONDITION over the FULL corpus, plus
-- a ceiling that aborts if the class has grown beyond what was reviewed. A
-- sampled assertion is how 20261003110400 shipped believing it was complete
-- while 20 of 81 rows had survived it.

select set_config('app.actor', 'migration:tag-category-text-junction-disagreement', true);

do $mig$
declare
  v_part1 int; v_part2 int; v_bad int; v_moved_text int;
begin
  ------------------------------------------------------------------ part 1 set
  -- Active rows where the text names a category that ALREADY HAS a junction row
  -- on this tag (proof it was curated, not invented) which is not the primary,
  -- whose current primary was minted by the 2026-08-29 revival batch, and where
  -- that curated category is a DIRECT CHILD of the substituted primary — the
  -- exact "moved off a curated child onto whatever parent category_id held"
  -- shape #3087 describes. The parent_id join is what excludes the three
  -- cross-branch/sibling rows discussed in the header.
  create temp table _revival_collateral on commit drop as
  select t.id,
         t.slug,
         t.category            as text_before,
         curated.category_id   as target
    from unified_tags t
    join tag_category_assignments prim
      on prim.tag_id = t.id and prim.is_primary
    join tag_categories prim_c on prim_c.id = prim.category_id
    join tag_category_assignments curated
      on curated.tag_id = t.id and not curated.is_primary
    join tag_categories curated_c
      on curated_c.id = curated.category_id
     and curated_c.name = t.category
     and curated_c.parent_id = prim_c.id
   where t.status = 'active'
     and t.category is not null
     and t.category is distinct from prim_c.name
     and prim.created_at >= timestamptz '2026-08-29 00:00:00+00';

  select count(*) into v_part1 from _revival_collateral;

  ------------------------------------------------------------------ part 2 set
  -- Everything else in the class: the junction is the only signal left.
  create temp table _junction_wins on commit drop as
  select t.id, t.slug, t.category as text_before, prim_c.name as target_text
    from unified_tags t
    join tag_category_assignments prim
      on prim.tag_id = t.id and prim.is_primary
    join tag_categories prim_c on prim_c.id = prim.category_id
   where t.category is not null
     and t.category is distinct from prim_c.name
     and t.id not in (select id from _revival_collateral);

  select count(*) into v_part2 from _junction_wins;

  -- Reviewed at 21 + 12. A larger class means something new happened and this
  -- migration's reasoning no longer covers it — stop rather than blanket-write.
  if v_part1 > 35 or v_part2 > 25 then
    raise exception
      'tag category disagreement: class larger than reviewed (part1=%, part2=%) — re-measure before applying',
      v_part1, v_part2;
  end if;

  --------------------------------------------------------------------- writes
  -- Part 1: category_id adopts the curated child. Both sync triggers fire from
  -- this one column, so the junction is repaired through the path that owns it
  -- rather than by touching tag_category_assignments directly.
  update unified_tags t
     set category_id = r.target
    from _revival_collateral r
   where t.id = r.id and t.category_id is distinct from r.target;

  -- Part 2: the text adopts the junction. category_id is untouched, so the
  -- BEFORE trigger's `category_id is distinct from` guard stays false and does
  -- not fight this write.
  update unified_tags t
     set category = r.target_text
    from _junction_wins r
   where t.id = r.id and t.category is distinct from r.target_text;

  ----------------------------------------------------------------- assertions
  -- 1. THE SAFETY PROPERTY FOR PART 1: not one published category text moved.
  --    The whole argument is that the text is the curated survivor; if this
  --    repair rewrote it, the repair would be the thing it is fixing.
  select count(*) into v_moved_text
    from _revival_collateral r join unified_tags t on t.id = r.id
   where t.category is distinct from r.text_before;
  if v_moved_text > 0 then
    raise exception 'tag category disagreement: % part-1 row(s) changed their published category text',
      v_moved_text;
  end if;

  -- 2. Part 1 landed: the primary junction now names what the text names.
  select count(*) into v_bad
    from _revival_collateral r
    join unified_tags t on t.id = r.id
   where not exists (
     select 1 from tag_category_assignments a
      join tag_categories c on c.id = a.category_id
     where a.tag_id = t.id and a.is_primary and c.name = t.category);
  if v_bad > 0 then
    raise exception 'tag category disagreement: % part-1 row(s) still lack a primary junction matching their text',
      v_bad;
  end if;

  -- 3. THE CLASS IS EMPTY, corpus-wide and over every status — not over the
  --    rows this migration happened to select.
  select count(*) into v_bad
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join tag_categories c on c.id = a.category_id
   where t.category is not null and t.category is distinct from c.name;
  if v_bad > 0 then
    raise exception 'tag category disagreement: % row(s) still disagree with their primary junction', v_bad;
  end if;

  -- 4. The AFTER trigger demotes as well as promotes; prove no tag ended up
  --    with two primaries, which is the shape 20260829072807 had to clean up.
  select count(*) into v_bad from (
    select tag_id from tag_category_assignments where is_primary
     group by tag_id having count(*) > 1) x;
  if v_bad > 0 then
    raise exception 'tag category disagreement: % tag(s) carry more than one primary junction', v_bad;
  end if;

  raise notice 'tag category disagreement: % revival-collateral rows re-pointed to their curated category, % rows adopted the junction text',
    v_part1, v_part2;
end
$mig$;

-- NOT ADDRESSED HERE, ON PURPOSE.
--
-- The producer is still open. The pre-#3087 loop is gone from the wave files, so
-- it cannot recur from that source, but nothing prevents a future writer from
-- inserting a primary junction derived from a stale category_id — there is no
-- constraint tying `unified_tags.category` to the primary junction, and both
-- sync triggers are one-directional (unified_tags -> junction, on a category_id
-- change only). A counter over this exact class belongs in check-tag-hygiene.mjs
-- alongside the two the 435-row resync migration adds; it is left to that PR so
-- the two do not add competing counters for adjacent classes.
