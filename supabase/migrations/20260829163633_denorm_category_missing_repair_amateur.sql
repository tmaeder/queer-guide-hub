-- Second occurrence of `denorm_category_missing` in one day, same shape as the
-- `lace` repair in 20260829142202: a tag left with a PRIMARY junction row and a
-- NULL category_id. The counter is a HARD tag-hygiene gate that reads live prod,
-- so one such row reds every open PR and the fixing PR cannot itself go green.
--
-- THE PRODUCER IS NOW IDENTIFIED, which is what makes this the last time.
-- `tag-enrichment-sweep` categorizePass wrote the filing as THREE sequential,
-- non-atomic PostgREST calls: demote the old primary, upsert the junction row,
-- then set unified_tags.category_id. Die between calls 2 and 3 and you get
-- exactly this row. Both of today's occurrences land on that job's
-- `0 */2 * * *` boundary -- `lace` 14:00:04Z, `amateur` 16:00:06Z -- and at 16:00
-- the sweep created exactly ONE junction row all hour, the broken one, i.e. it
-- stopped right after the upsert. It is silent too: `cat_applied` increments
-- only after the write that never happened.
--
-- The companion change collapses those three calls into a single
-- `update unified_tags set category_id, category`, because
-- sync_tag_category_assignment_after already performs the demote and the
-- insert-or-promote atomically in the same transaction -- the three calls were a
-- hand-rolled copy of a trigger that was always there. After it, this state is
-- unrepresentable from that path.
--
-- Same scoping discipline as 20260829142202: set-based rather than pinned to one
-- id (sibling sessions write this table continuously, so "exactly 1 row" would
-- fail if the population moved between authoring and apply), both columns named
-- so the column-scoped trg_search_documents_tag actually fires, and the
-- postcondition asserts only over what the UPDATE repairs -- rows with a PRIMARY
-- junction and no category_id. A tag holding only non-primary junction rows
-- still counts toward the metric but has no primary to derive from, and guessing
-- one is a filing decision a migration must not make.

do $mig$
declare
  v_fixed int;
  v_left  int;
begin
  perform set_config('app.actor', 'migration:denorm-category-missing-repair-2', true);

  update public.unified_tags u
     set category_id = a.category_id,
         category    = c.name,
         updated_at  = now()
    from public.tag_category_assignments a
    join public.tag_categories c on c.id = a.category_id
   where a.tag_id = u.id
     and a.is_primary
     and u.category_id is null;
  get diagnostics v_fixed = row_count;

  select count(*) into v_left
    from public.unified_tags u
   where u.category_id is null
     and exists (select 1
                   from public.tag_category_assignments a
                  where a.tag_id = u.id and a.is_primary);

  if v_left <> 0 then
    raise exception 'denorm_category_missing: % row(s) still have a primary junction and no category_id', v_left;
  end if;

  raise notice 'denorm_category_missing repair: % row(s) filled from their primary junction', v_fixed;
end
$mig$;