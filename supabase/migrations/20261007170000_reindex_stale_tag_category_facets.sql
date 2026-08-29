-- 77 tag search documents publish a category that no longer exists.
--
-- These are the rename half of the v3 swap, one surface further out than
-- 20261006180000 fixed. That migration repairs `unified_tags.category` from
-- the junction; these rows never needed it — their column and their junction
-- already agree on the new name. What is stale is `search_documents.facets
-- ->> 'category'`, which still holds the name of a stop that has since been
-- DELETED ("Sexual Roles", "Body Types & Archetypes").
--
-- Nothing was going to fix them, and that is the point worth recording: a
-- reindex is only enqueued when a row is WRITTEN, and these rows were not.
-- The stop was renamed in `tag_categories`, not in `unified_tags`, so the
-- column-scoped trigger on `unified_tags` never fired for a tag whose own
-- columns did not change. Measured: `unified_tags.updated_at` on
-- "Promiscuity" is 2026-07-24 while its search document was last written
-- 2026-08-28 — the tag was re-filed underneath the index without the index
-- being told. A renamed PARENT is a change to every child's derived surface
-- and to none of its own rows.
--
-- The repair is an enqueue, not a rewrite: `search_reindex_drain` recomputes
-- the document from the junction, which is already correct. Verified on one
-- row first — enqueue + drain took "Promiscuity" from "Sexual Roles" to
-- "Dynamics & Roles" — so this is a proven mechanism applied at scale, not a
-- hopeful one.
--
-- Deliberately NOT a blanket reindex of every tag: the queue is drained a
-- thousand rows a minute and 3,748 tag documents would evict genuine work
-- behind them. Only documents naming a category that does not exist.

set local statement_timeout = '600s';

do $$
declare
  v_queued int;
  v_left int;
begin
  insert into search_reindex_queue (entity_type, entity_id)
  select 'tag', sd.entity_id
  from search_documents sd
  where sd.entity_type = 'tag'
    and sd.facets ->> 'category' is not null
    and not exists (
      select 1 from tag_categories c where c.name = sd.facets ->> 'category');
  get diagnostics v_queued = row_count;

  -- Drain synchronously so the fix lands with the migration rather than
  -- within the next minute — and so the postcondition below measures the
  -- outcome instead of the intent.
  perform public.search_reindex_drain(greatest(v_queued * 2, 200));

  select count(*) into v_left
  from search_documents sd
  where sd.entity_type = 'tag'
    and sd.facets ->> 'category' is not null
    and not exists (
      select 1 from tag_categories c where c.name = sd.facets ->> 'category');

  if v_left > 0 then
    raise exception 'stale tag facets: % documents still name a deleted category after reindex', v_left;
  end if;

  raise notice 'stale tag facets: re-indexed % documents', v_queued;
end $$;
