-- Reconcile unified_tags.category_id with tag_category_assignments, corpus-wide.
--
-- WHAT IS BROKEN
--
-- A tag states its category in three places: unified_tags.category_id, the
-- unified_tags.category TEXT column derived from it, and a primary row in
-- tag_category_assignments. 378 rows disagree with themselves, in two shapes:
--
--   366  category_id has no matching primary junction row
--    12  TWO primary junction rows, so "the primary" is not even well defined
--
-- 20261004110000_kinktionary_revival_w1 blocked every deploy for hours on
-- exactly this (3 of its 153 slugs), and 20260829054833 repaired those 3 by
-- hand. This finishes the class rather than waiting for the next wave to trip
-- over its own share of it.
--
-- HOW IT AROSE. Both sync triggers are guarded by
-- `new.category_id is distinct from old.category_id`, so they only maintain the
-- junction when category_id CHANGES. Any writer that inserted a junction row
-- directly, or set the TEXT column directly, left the three representations
-- free to diverge with nothing to pull them back. 20260907100000 and
-- 20260910171943 are named in the revival's own header for the mirror-image
-- defect (junction written, column left stale).
--
-- THE RULE, AND WHY IT ANCHORS ON THE TEXT COLUMN
--
-- For each drifted row the target category is the one named by its `category`
-- TEXT — the value a reader actually sees — falling back to category_id for the
-- 47 rows whose text is null. Measured first: every non-null text on these rows
-- resolves to a real tag_categories row, so the anchor is never a guess.
--
-- The consequence is the point: NOT ONE PUBLISHED CATEGORY CHANGES. This is a
-- consistency repair, not a re-filing. Anchoring on category_id instead would
-- have rewritten the visible category on 309 rows — the BEFORE trigger derives
-- the text from the column — which is an editorial decision, not deploy
-- hygiene. Rows whose published category looks WRONG (see the note at the end)
-- are left alone and flagged rather than silently re-filed here.
--
-- All three writes are explicit rather than delegated to the triggers, because
-- for the 21 rows where text already agrees with category_id the column does
-- not change, the guard above is false, and a trigger-dependent repair would
-- silently skip exactly the rows that need the junction created.

select set_config('app.actor', 'migration:tag-category-junction-full-repair', true);

do $mig$
declare v_n int; v_moved int; v_demoted int; v_upserted int;
begin
  create temp table _drift on commit drop as
  select t.id,
         t.slug,
         t.category                                   as text_before,
         t.category_id                                as col_before,
         coalesce(tc.id, t.category_id)               as target
    from unified_tags t
    left join tag_categories tc on tc.name = t.category
   where (t.category_id is not null
          and not exists (select 1 from tag_category_assignments a
                           where a.tag_id = t.id and a.category_id = t.category_id and a.is_primary))
      or t.id in (select tag_id from tag_category_assignments
                   where is_primary group by tag_id having count(*) > 1);

  -- Never act on a row whose anchor could not be resolved.
  select count(*) into v_n from _drift where target is null;
  if v_n > 0 then
    raise exception 'junction repair: % row(s) have no resolvable target category', v_n;
  end if;

  -- 1. Column adopts the published value.
  update unified_tags t
     set category_id = d.target
    from _drift d
   where t.id = d.id and t.category_id is distinct from d.target;
  get diagnostics v_moved = row_count;

  -- 2. Demote every primary that is not the target. Covers the 12 double-primary
  --    rows as a side effect: at most one primary can survive per tag.
  update tag_category_assignments a
     set is_primary = false
    from _drift d
   where a.tag_id = d.id and a.is_primary and a.category_id <> d.target;
  get diagnostics v_demoted = row_count;

  -- 3. The target row exists and is primary. Mirrors
  --    sync_tag_category_assignment_after()'s own upsert, including its
  --    conflict target, so the two cannot disagree about what "primary" means.
  insert into tag_category_assignments (tag_id, category_id, is_primary)
  select d.id, d.target, true from _drift d
  on conflict (tag_id, category_id) do update set is_primary = true;
  get diagnostics v_upserted = row_count;

  ----------------------------------------------------------------- assertions
  -- The invariant, corpus-wide and not merely for the rows touched here.
  select count(*) into v_n from unified_tags t
   where t.category_id is not null
     and not exists (select 1 from tag_category_assignments a
                      where a.tag_id = t.id and a.category_id = t.category_id and a.is_primary);
  if v_n > 0 then
    raise exception 'junction repair: % row(s) still have no matching primary junction', v_n;
  end if;

  select count(*) into v_n from (
    select tag_id from tag_category_assignments where is_primary group by tag_id having count(*) > 1
  ) x;
  if v_n > 0 then
    raise exception 'junction repair: % tag(s) still carry more than one primary junction', v_n;
  end if;

  -- THE SAFETY PROPERTY. Not one reader-visible category may have moved.
  select count(*) into v_n
    from _drift d join unified_tags t on t.id = d.id
   where t.category is distinct from d.text_before;
  if v_n > 0 then
    raise exception 'junction repair: % row(s) changed their published category text', v_n;
  end if;

  raise notice 'junction repair: % examined, % column moves, % demoted, % junctions upserted',
    (select count(*) from _drift), v_moved, v_demoted, v_upserted;
end
$mig$;

-- NOT FIXED HERE, ON PURPOSE. Three active rows disagreed on all three axes and
-- keep their published category, which for two of them reads wrong:
--
--   prep       published 'Consent & Negotiation'  (PrEP is sexual health)
--   mullerian  published 'Fetishes & Interests'   (an anatomy term)
--   viagra     published 'Sexual Health'          (defensible; PDE5 work may
--                                                  prefer Substances)
--
-- Re-filing a live health page is an editorial call. They are now internally
-- consistent and can be moved by the normal category path whenever that call
-- is made.