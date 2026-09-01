-- Three tags whose category_id disagrees with their own primary junction row.
--
-- WHY THIS EXISTS, AND WHY IT IS ITS OWN MIGRATION
--
-- 20261004110000_kinktionary_revival_w1 fails on every `db push` with
--   kinktionary revive w1: 3 row(s) have no primary junction row
-- and has done since it merged, so NO migration has applied since. The message
-- is slightly narrower than the condition: all three rows DO have a primary
-- junction row. What they do not have is one whose category_id equals
-- `unified_tags.category_id`.
--
-- ROOT CAUSE (measured, not inferred). Both category sync triggers are guarded
-- by `new.category_id is distinct from old.category_id`:
--   sync_tag_category_assignment()        BEFORE UPDATE  -> derives category TEXT
--   sync_tag_category_assignment_after()  AFTER UPDATE OF category_id -> owns the junction
-- The revival migration is STATUS ONLY and deliberately never writes
-- category_id, so the AFTER trigger cannot fire and the migration cannot create
-- or repair a junction row. Its assertion therefore tests PRE-EXISTING
-- consistency, and 3 of its 153 slugs do not have it. The revival did not cause
-- this and cannot fix it from inside its own scope.
--
-- The drift is corpus-wide and predates all of this: 397 tags carry a
-- category_id with no matching primary junction — 59 with no junction at all
-- and 338 disagreeing with one that exists. It is the residue of migrations
-- that wrote the junction directly without touching category_id (20260907100000
-- and 20260910171943 are named in the revival's own header for the mirror-image
-- defect). Only the 3 that block the deploy are repaired here; re-filing the
-- other 394 is a reviewed decision, not deploy triage, and it is exactly the
-- "second, unreviewed change riding along" the revival's header refuses.
--
-- DIRECTION OF THE REPAIR. Each of the three asserts its category three times
-- and disagrees with itself once:
--
--   slug            category (text)   category_id ->      primary junction ->
--   medical-play    Sexual Health     Health & Wellness   Sexual Health
--   needle-play     Sexual Health     Health & Wellness   Sexual Health
--   power-exchange  Sexual Health     Health & Wellness   Sexual Health
--
-- `Sexual Health` (level 1) is a CHILD of `Health & Wellness` (level 0), so the
-- column holds the PARENT while the text column and the curated junction both
-- hold the child. Two of three signals say child, so category_id is moved to the
-- child. The alternative — promoting a `Health & Wellness` junction to match the
-- column — would leave `category` text contradicting both, and the BEFORE
-- trigger would then rewrite that published text on three live pages. This
-- direction changes no rendered category at all.
--
-- This is NOT a reclassification. Whether kink terms belong under Health at all
-- (they read as BDSM/practice vocabulary) is a real question and is left to the
-- correction pass the revival's header already names.
--
-- VERSION IS DELIBERATELY BELOW 20261004110000. `db push` applies in version
-- order and aborts at the first failure, so a repair stamped above the revival
-- could never run before it. Applied via MCP first and committed at the stamped
-- version, per the CLAUDE.md early-apply convention; CI then skips it.
--
-- WAVES 2-4 OF THE REVIVAL WILL HIT THIS AGAIN for their own slugs. The fix for
-- those is not another one-off: either the wave asserts the invariant only for
-- rows it actually writes, or it repairs the mismatch itself by writing
-- category_id (which makes the AFTER trigger do the work).

-- log_unified_tag_change() raises on a human_reviewed row when app.actor is
-- unset (it defaults to 'system:trigger').
select set_config('app.actor', 'migration:tag-category-junction-drift-repair', true);

do $mig$
declare v_bad int; v_fixed int;
begin
  -- Adopt the category the row's own primary junction already asserts. Bounded
  -- to the three blocking slugs and to the mismatched shape, so a re-run is a
  -- no-op and no other row can be touched.
  update public.unified_tags t
     set category_id = a.category_id,
         updated_at  = now()
    from public.tag_category_assignments a
   where a.tag_id = t.id
     and a.is_primary
     and t.slug in ('medical-play', 'needle-play', 'power-exchange')
     and t.category_id is distinct from a.category_id;
  get diagnostics v_fixed = row_count;

  -- The invariant the revival asserts, for exactly these rows.
  select count(*) into v_bad
    from public.unified_tags t
   where t.slug in ('medical-play', 'needle-play', 'power-exchange')
     and not exists (
       select 1 from public.tag_category_assignments a
        where a.tag_id = t.id and a.category_id = t.category_id and a.is_primary);
  if v_bad > 0 then
    raise exception 'category junction repair: % of 3 row(s) still mismatched', v_bad;
  end if;

  -- The text column must still say what it said; this repair may not change a
  -- published category. (The BEFORE trigger rewrites it from category_id, so
  -- this is a real check, not a tautology.)
  select count(*) into v_bad
    from public.unified_tags
   where slug in ('medical-play', 'needle-play', 'power-exchange')
     and category is distinct from 'Sexual Health';
  if v_bad > 0 then
    raise exception 'category junction repair: % row(s) changed published category text', v_bad;
  end if;

  raise notice 'category junction repair: % row(s) realigned', v_fixed;
end
$mig$;
