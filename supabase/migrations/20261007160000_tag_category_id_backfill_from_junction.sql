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
  r        record;
  v_bad    int;
  v_ambig  int;
  v_done   int := 0;
begin
  -- A tag with MORE THAN ONE is_primary junction has no single answer, so it is
  -- skipped rather than resolved arbitrarily.
  --
  -- This is not hypothetical. The first apply of this migration FAILED on its
  -- own second assertion: `gender-neutral-bathroom` carries two is_primary rows
  -- (gender-identity and safe-spaces), created by 20261007140000
  -- prevention_bathroom_plural_twin which applied minutes earlier. The
  -- unqualified join picked one arbitrarily, wrote it to the column, and the
  -- assertion then correctly reported the other as disagreeing.
  --
  -- Picking either would manufacture a truth the data does not contain, and do
  -- it silently: the column would disagree with a junction that still renders.
  -- Nothing enforces one-primary-per-tag, so duplicate primaries are their own
  -- defect and belong to whoever created them, not to a backfill. The count is
  -- reported below so skipping cannot pass unnoticed.
  for r in
    select t.id, ca.category_id as cat_id, c.name as cat_name
      from public.unified_tags t
      join public.tag_category_assignments ca
        on ca.tag_id = t.id and ca.is_primary
      join public.tag_categories c
        on c.id = ca.category_id
     where t.category_id is null
       and (select count(*) from public.tag_category_assignments p
             where p.tag_id = t.id and p.is_primary) = 1
     order by t.slug
  loop
    update public.unified_tags
       set category_id = r.cat_id,
           category    = r.cat_name,
           updated_at  = now()
     where id = r.id;
    v_done := v_done + 1;
  end loop;

  select count(*) into v_ambig
    from (select ca.tag_id from public.tag_category_assignments ca
           where ca.is_primary group by ca.tag_id having count(*) > 1) d;

  ------------------------------------------------------------------ assertions
  -- Both assertions are scoped to UNAMBIGUOUS rows — the ones this migration
  -- actually claims to fix. Left corpus-wide they would fail on the duplicate-
  -- primary rows above, which this migration deliberately does not touch, and
  -- the only way to make them pass would be to guess.
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_category_assignments ca
      on ca.tag_id = t.id and ca.is_primary
   where t.category_id is null
     and (select count(*) from public.tag_category_assignments p
           where p.tag_id = t.id and p.is_primary) = 1;
  if v_bad > 0 then
    raise exception 'category_id backfill: % row(s) still have a sole junction but no category_id', v_bad;
  end if;

  -- Must not have INTRODUCED a disagreement, the failure mode a careless fill
  -- creates.
  select count(*) into v_bad
    from public.unified_tags t
    join public.tag_category_assignments ca
      on ca.tag_id = t.id and ca.is_primary
   where t.category_id is distinct from ca.category_id
     and (select count(*) from public.tag_category_assignments p
           where p.tag_id = t.id and p.is_primary) = 1;
  if v_bad > 0 then
    raise exception 'category_id backfill: % row(s) now disagree with their sole junction', v_bad;
  end if;

  raise notice 'category_id backfill: % row(s) filled, % tag(s) skipped for having multiple primary junctions',
    v_done, v_ambig;
end
$mig$;
