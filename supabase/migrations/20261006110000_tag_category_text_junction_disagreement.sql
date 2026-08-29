-- 21 tag pages still carry the reclassification #3087 was written to prevent,
-- because prod ran the revival 16 minutes before that fix merged.
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
-- selects from tag_category_assignments, so THE JUNCTION IS WHAT /tags/:slug
-- SHOWS, and rewriting it "silently reclassifies live pages — 24 of the drifted
-- rows in waves 2-4, moved off a curated child category and onto whatever parent
-- category_id happened to hold."
--
-- Those pages are not hypothetical, and the fix can never reach them:
--
--     2026-08-29 06:08:40 UTC   waves w3 + w4 applied (schema_migrations)
--     2026-08-29 06:24:36 UTC   12af05ccb authored
--
-- The waves were already recorded applied, so `db push` will never re-run them
-- and the corrected loop will never execute against this data. #3087 fixed the
-- source file for a run that had already happened.
--
--
-- WHY 20260829072807 DID NOT ALREADY FIX THIS
--
-- That migration reconciles the same corpus and anchors on the published
-- `category` TEXT, which is the same rule applied here. It cannot see this class:
-- its `_drift` predicate is "category_id has no matching primary junction", and
-- on every row here category_id ALREADY EQUALS the primary junction — the old
-- loop set both from the same value. The text column is never in its WHERE
-- clause. Measured on prod at 08:21 UTC, an hour after it applied: 33 rows
-- disagree between text and primary junction, and ZERO of them were written by
-- it. Its "not one published category moves" post-condition held for its rows
-- without covering these.
--
--
-- WHICH SURFACE IS CURATED, MEASURED RATHER THAN ARGUED
--
--   category_id      the PARENT, unchanged since April — the stale side
--   junction primary the PARENT, INSERTED 2026-08-29 06:08:40 by the old loop
--   junction (2nd)   the CHILD, row created 2026-04-11, demoted by that loop
--   category text    the CHILD, written 2026-08-02 by admin:tag-category-resync
--
-- `admin:tag-category-resync` is a junction -> text denormaliser (8,450 rows,
-- 2026-08-02..08-15, every one a text change). It read the junction and wrote
-- the child, which is direct evidence the CHILD held is_primary before 06:08.
-- So the text is a preserved snapshot of the correct pre-revival junction state.
--
-- category_id and the junction agreeing is NOT two votes against one. #3087's
-- own test is "two of three signals", and it only holds when the signals are
-- independent: here the primary junction was DERIVED FROM category_id, 21 days
-- after the admin set the text. One signal, counted twice.
--
--
-- THIS MOVES 21 LIVE PAGES, AND NO REPAIR COULD AVOID MOVING SOMETHING
--
-- The text and the junction currently disagree, and both are reader-visible on
-- different surfaces — the junction renders on /tags/:slug, the text feeds
-- `search_documents` and so the search category facet. "Change nothing visible"
-- is not on the menu; the only choice is which surface moves. This moves the
-- PAGE onto the curated child (safe-words: Safety & Practices -> Consent &
-- Negotiation), which is un-reclassifying rather than reclassifying, and leaves
-- the text — the evidence the whole argument rests on — untouched. Both
-- categories already render on the page; only which one is primary changes.
--
-- The write is `category_id` only. trg_sync_tag_category (BEFORE) derives the
-- text, which is already this value and so does not move; trg_sync_tag_category_after
-- demotes the stale parent and promotes the existing April row. Nothing is
-- invented: the target must ALREADY EXIST as a junction row on the tag, which is
-- what makes it curated rather than guessed.
--
--
-- RESTRICTED TO A STRICT PARENT -> CHILD MOVE, WHICH IS LOAD-BEARING
--
-- #3087 describes one shape: rows "moved off a curated child category and onto
-- whatever PARENT category_id happened to hold". 21 of the 24 are that shape.
-- Three are not, and taking them would import an unreviewed editorial change
-- under cover of a consistency repair:
--
--   crossdresser-transvestite     Gender Identity    -> Sexual Health       (cross-branch)
--   safe-sane-and-consensual-ssc  Safety & Practices -> Slang & Terminology (cross-branch)
--   piss-slut                     Sexual Roles       -> Practices & Play    (sibling)
--
-- The first two are worse than what they would replace, not merely different:
-- filing a gender-expression term under Sexual Health pathologises it, and SSC
-- is a foundational consent framework rather than slang. Where the target is not
-- a CHILD of what the revival substituted, the "curated child" argument does not
-- apply — there is no parent/child relationship to have been coarsened. They
-- keep the category their page shows today.
--
--
-- WHAT IS DELIBERATELY LEFT DISAGREEING, AND WHO OWNS IT
--
-- 12 rows keep a text that disagrees with their primary junction. Nothing here
-- writes them, and the assertion below enumerates them by SHAPE so the omission
-- is checked rather than assumed:
--
--   7 deprecated/merged whose text names a category that does not exist in
--     tag_categories at all (`Global & Regional Rights`, `Queer History by
--     Region`) with category_id NULL. All 7 sit in the 435-row "category_id NULL
--     while a junction exists" cohort owned by 20261005100100, which sets
--     category_id from the junction and lets the BEFORE trigger derive this same
--     text. Repairing them here would duplicate that migration on its own rows.
--
--   5 active — the 3 above plus `golden-shower` and `deli`, whose primary
--     junction dates from 2026-06-07 and was never touched by the waves. Their
--     text came from junk (`terms`, NULL), so it carries no curation to protect,
--     but rewriting it would move a reader-visible search facet for no
--     correctness gain. Left as an editorial decision.
--
--
-- SCOPE GUARD, NOT A FROZEN ID LIST. The predicates are structural, so a row
-- repaired by a concurrent session before this applies is simply not selected
-- rather than a hard failure — several sessions were repairing this table on
-- 2026-08-29. The remainder is asserted by SHAPE rather than by count, because
-- 20261005100100 sorts earlier and may or may not have run first; either way it
-- can only shrink the remainder, never introduce a shape not listed here. A
-- sampled assertion is how 20261003110400 shipped believing it was complete
-- while 20 of 81 rows had survived it.

select set_config('app.actor', 'migration:tag-category-revival-collateral', true);

do $mig$
declare
  v_n int; v_moved_text int; v_remaining int;
begin
  -- Active rows where the text names a category that ALREADY HAS a junction row
  -- on this tag (proof it was curated, not invented) which is not the primary,
  -- whose current primary was minted by the 2026-08-29 revival batch, and where
  -- that curated category is a DIRECT CHILD of the substituted primary. The
  -- parent_id join is what excludes the three cross-branch/sibling rows above.
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

  select count(*) into v_n from _revival_collateral;

  -- Reviewed at 21. A larger set means something new happened and this
  -- migration's reasoning no longer covers it — stop rather than blanket-write.
  if v_n > 35 then
    raise exception
      'tag category revival collateral: % rows is larger than the reviewed set — re-measure before applying', v_n;
  end if;

  ---------------------------------------------------------------------- write
  -- category_id only. Both sync triggers fire from this one column, so the
  -- junction is repaired through the path that owns it rather than by touching
  -- tag_category_assignments directly.
  update unified_tags t
     set category_id = r.target
    from _revival_collateral r
   where t.id = r.id and t.category_id is distinct from r.target;

  ----------------------------------------------------------------- assertions
  -- 1. THE SAFETY PROPERTY: not one published category text moved. The whole
  --    argument is that the text is the curated survivor; if this repair
  --    rewrote it, the repair would be the thing it is fixing.
  select count(*) into v_moved_text
    from _revival_collateral r join unified_tags t on t.id = r.id
   where t.category is distinct from r.text_before;
  if v_moved_text > 0 then
    raise exception 'tag category revival collateral: % row(s) changed their published category text',
      v_moved_text;
  end if;

  -- 2. It landed: the primary junction now names what the text names.
  select count(*) into v_n
    from _revival_collateral r join unified_tags t on t.id = r.id
   where not exists (
     select 1 from tag_category_assignments a
      join tag_categories c on c.id = a.category_id
     where a.tag_id = t.id and a.is_primary and c.name = t.category);
  if v_n > 0 then
    raise exception 'tag category revival collateral: % row(s) still lack a primary junction matching their text',
      v_n;
  end if;

  -- 3. THE REMAINDER IS ONLY WHAT THIS MIGRATION DECLINED TO TOUCH — checked
  --    over the FULL corpus and by shape, not by count and not over a sample.
  --    Anything disagreeing that is neither an orphan-text row nor one of the
  --    five named holds is a shape nobody reviewed, and it fails here.
  select count(*) into v_n
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join tag_categories c on c.id = a.category_id
   where t.category is not null
     and t.category is distinct from c.name
     and exists (select 1 from tag_categories oc where oc.name = t.category)   -- text resolves
     and t.slug not in ('crossdresser-transvestite', 'safe-sane-and-consensual-ssc',
                        'piss-slut', 'golden-shower', 'deli');
  if v_n > 0 then
    raise exception 'tag category revival collateral: % unreviewed row(s) still disagree with their primary junction',
      v_n;
  end if;

  -- 4. The AFTER trigger demotes as well as promotes; prove no tag ended up with
  --    two primaries, which is the shape 20260829072807 had to clean up.
  select count(*) into v_n from (
    select tag_id from tag_category_assignments where is_primary
     group by tag_id having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'tag category revival collateral: % tag(s) carry more than one primary junction', v_n;
  end if;

  select count(*) into v_remaining
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join tag_categories c on c.id = a.category_id
   where t.category is not null and t.category is distinct from c.name;

  raise notice 'tag category revival collateral: % page(s) restored to their curated child, % row(s) left disagreeing by design',
    (select count(*) from _revival_collateral), v_remaining;
end
$mig$;

-- NOT ADDRESSED HERE, ON PURPOSE.
--
-- The producer is still open. The pre-#3087 loop is gone from the wave files, so
-- it cannot recur from that source, but nothing prevents a future writer from
-- inserting a primary junction derived from a stale category_id — there is no
-- constraint tying `unified_tags.category` to the primary junction, and both
-- sync triggers are one-directional (unified_tags -> junction, on a category_id
-- change only). A counter over this class belongs in check-tag-hygiene.mjs
-- alongside the ones 20261005100100 adds; it is left to that PR so the two do
-- not add competing counters for adjacent classes.
