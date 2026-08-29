-- Populate unified_tags.category_id from the primary junction on 435 rows.
--
-- WHAT THIS IS, AND WHAT IT IS NOT
--
-- Earlier work in this program described a corpus-wide "category_id vs junction
-- DRIFT" — rows where the column and the junction named DIFFERENT categories.
-- That framing is now wrong and the measurement says so:
--
--   select count(*) from unified_tags t
--     join tag_category_assignments ca on ca.tag_id = t.id and ca.is_primary
--    where t.category_id is distinct from ca.category_id
--      and t.category_id is not null;      -- => 0
--
-- There are ZERO genuine disagreements left; waves 1-4 and #3087 cleared them.
-- What remains is 435 rows (418 deprecated, 16 active, 1 merged) where
-- category_id was simply NEVER POPULATED while the junction holds the truth.
-- That is a one-directional fill, not a conflict resolution, and it is why this
-- migration can be unconditional where #3087 had to reason about which side won.
--
-- WHY IT MATTERS DESPITE NOTHING RENDERING WRONG
--
-- fetchTagWithCategories reads the JUNCTION, so all 16 active rows already
-- display their correct category. The damage is to everything that reads the
-- COLUMN: tag_hygiene_stats().uncategorized_active counts category_id, so these
-- rows are reported as uncategorized while visibly being categorised, and any
-- admin filter or gate written as `where category_id = ...` cannot see them.
-- This is the same split that made 20260907100000's junction-only writes
-- invisible to the hygiene metric.
--
-- BOTH COLUMNS MUST BE IN THE UPDATE STATEMENT
--
-- `trg_search_documents_tag` is scoped to UPDATE OF (name, short_description,
-- description, CATEGORY, slug, image_url, entity_kind, merged_into_id,
-- deprecated_at, status) — the denormalized TEXT column, not category_id. A
-- column-scoped trigger fires on the columns named in the UPDATE STATEMENT, not
-- on what a BEFORE trigger mutated, so `SET category_id = ...` alone would let
-- sync_tag_category_assignment() rewrite `category` while search never learned
-- about it, leaving search_documents holding a stale (usually empty) category
-- for all 435. Naming `category` explicitly is what keeps the search index
-- honest. This is the same trap documented for trg_venues_safety_gated.
--
-- The value written to `category` is the one the BEFORE trigger would derive
-- anyway; stating it makes the statement self-consistent rather than relying on
-- the trigger to correct a placeholder.
--
-- ORDERING: this runs AFTER 20261006100000 (the prose retraction) purely by
-- version. They touch disjoint columns and do not interact.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:tag-category-id-backfill', true);

do $mig$
declare
  r       record;
  v_bad   int;
  v_done  int := 0;
  v_wrote uuid[] := '{}';   -- the rows THIS migration filled; see the assertion
begin
  for r in
    select t.id, ca.category_id as cat_id, c.name as cat_name
      from public.unified_tags t
      join public.tag_category_assignments ca
        on ca.tag_id = t.id and ca.is_primary
      join public.tag_categories c
        on c.id = ca.category_id
     where t.category_id is null
     order by t.slug
  loop
    update public.unified_tags
       set category_id = r.cat_id,
           category    = r.cat_name,
           updated_at  = now()
     where id = r.id;
    v_done  := v_done + 1;
    v_wrote := v_wrote || r.id;
  end loop;

  ------------------------------------------------------------------ assertions
  -- Nothing may be left holding a junction but no column.
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_category_assignments ca
      on ca.tag_id = t.id and ca.is_primary
   where t.category_id is null;
  if v_bad > 0 then
    raise exception 'category_id backfill: % row(s) still have a junction but no category_id', v_bad;
  end if;

  -- And this must not have INTRODUCED a disagreement, which is the failure mode
  -- a careless fill would create.
  --
  -- SCOPED TO THE ROWS THIS MIGRATION WROTE, and that scoping is the fix for an
  -- outage. As written it was corpus-wide, which made it fail on a row this
  -- migration never touched and CANNOT repair: the loop is fill-only
  -- (`category_id is null`), so a row that already held a NON-NULL category_id
  -- disagreeing with its junction is invisible to the loop and fatal to the
  -- assertion. Exactly that happened — `u-equals-u` acquired such a
  -- disagreement between this file being written (its header measured 0) and
  -- being applied, and the migration then died with
  --
  --   ERROR: category_id backfill: 1 row(s) now disagree with their junction
  --
  -- aborting db push and every migration behind it. Eight consecutive deploys
  -- on main failed; nothing applied past 20261007140000 for hours while edge
  -- functions kept shipping against the old schema.
  --
  -- The header's "ZERO genuine disagreements left" was true when measured and
  -- false by the time it ran. A guard may only cover what its own migration
  -- changed — otherwise it reports someone else's later write as this
  -- migration's defect. `u-equals-u` is repaired on its own terms in
  -- 20261007163200, which promotes the Sexual Health junction row it already
  -- had. (An HIV treatment-as-prevention concept was filed under Orientation.)
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_category_assignments ca
      on ca.tag_id = t.id and ca.is_primary
   where t.id = any (v_wrote)
     and t.category_id is distinct from ca.category_id;
  if v_bad > 0 then
    raise exception 'category_id backfill: % row(s) THIS migration filled disagree with their junction', v_bad;
  end if;

  raise notice 'category_id backfill: % row(s) filled', v_done;
end
$mig$;
