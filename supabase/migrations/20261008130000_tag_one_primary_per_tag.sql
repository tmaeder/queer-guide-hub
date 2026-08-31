-- A tag may hold at most ONE primary category, and nothing enforced it.
--
-- `tag_category_assignments` has a unique key on (tag_id, category_id) — one
-- row per pair — but nothing stopping two of a tag's rows both carrying
-- `is_primary`. The taxonomy-v3 program opened with 12 such tags and closed
-- with 0; within hours one was back ("Gender-Neutral Bathroom": a primary on
-- gender-identity from 2026-06-07 and a second on safe-spaces from today,
-- added by a concurrent session's re-file).
--
-- It came back because the writers ASK for it. Both LLM writers upsert
-- `is_primary = true` without demoting what is already there:
--   * categorize-tags demoted only when its `recategorize` flag was set, so
--     every other path — including the `only_misfiled` one the operator
--     driver uses — added a second primary.
--   * tag-enrichment-sweep never demoted at all.
-- Both are fixed in this PR; this index is what makes the state unspellable
-- rather than merely un-asked-for, since the junction is also written by
-- migrations, by the admin UI and by hand.
--
-- Which primary is "the" one matters to readers: `fetchTagWithCategories`
-- takes the primary for the page's taxonomy line, and the mirror reconciler
-- resolves `unified_tags.category` by `is_primary desc, level desc,
-- created_at asc`. With two primaries those two can disagree, and the tag
-- publishes one category on its page and another in the search facet.
--
-- The one live offender is repaired first, keeping the filing its own text
-- mirror already asserts ("Venue Features & Policies") and DEMOTING the
-- stale one rather than deleting it — a gender-neutral bathroom is a venue
-- feature, and the older gender-identity filing survives as a cross-listing.

set local statement_timeout = '600s';

do $$
declare v_fixed int; v_left int;
begin
  perform set_config('app.actor', 'migration:20261008130000_tag_one_primary_per_tag', true);

  -- Keep the primary the tag's own text mirror names; if the mirror names
  -- none of them, keep the most recently filed. Demote the rest.
  with dupes as (
    select a.id,
           row_number() over (
             partition by a.tag_id
             order by (c.name is not distinct from t.category) desc,
                      a.created_at desc,
                      a.category_id
           ) as rn
      from tag_category_assignments a
      join tag_categories c on c.id = a.category_id
      join unified_tags t on t.id = a.tag_id
     where a.is_primary
       and a.tag_id in (select tag_id from tag_category_assignments
                         where is_primary group by tag_id having count(*) > 1)
  )
  update tag_category_assignments a
     set is_primary = false
    from dupes d
   where a.id = d.id and d.rn > 1;
  get diagnostics v_fixed = row_count;

  select count(*) into v_left from (
    select tag_id from tag_category_assignments where is_primary
     group by tag_id having count(*) > 1) x;
  if v_left > 0 then
    raise exception 'one-primary repair: % tag(s) still hold two primaries', v_left;
  end if;

  raise notice 'one-primary repair: demoted % duplicate primary row(s)', v_fixed;
end $$;

-- Not CONCURRENTLY: migrations run inside a transaction, and this table is
-- ~6,800 rows, so the brief lock is cheaper than the drift a separate
-- out-of-band index build would risk.
create unique index if not exists tag_category_assignments_one_primary_per_tag
  on public.tag_category_assignments (tag_id)
  where is_primary;

comment on index public.tag_category_assignments_one_primary_per_tag is
  'A tag has at most one primary category. Writers must DEMOTE the existing primary before promoting a new one (update is_primary=false where tag_id=… and category_id<>…), not upsert a second — see categorize-tags and tag-enrichment-sweep.';
