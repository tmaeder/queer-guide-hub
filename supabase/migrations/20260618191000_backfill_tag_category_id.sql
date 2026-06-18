-- ============================================================================
-- Backfill unified_tags.category_id from the primary tag_category_assignment
-- ----------------------------------------------------------------------------
-- 1,704 active tags had a tag_category_assignment row but a NULL category_id
-- column (the column the frontend tag hooks — useCentralizedTags/useTags/
-- usePageFetchers — read). The drift came from assignments written directly
-- (older imports, enrichment) without setting the denormalized column.
--
-- The BEFORE trigger trg_sync_tag_category re-touches tag_category_assignments
-- on a category_id change, which collides with a set-based UPDATE that reads the
-- same table ("tuple already modified"). category_id is NOT in the
-- trg_search_documents_tag watch list, so disabling the sync trigger for the
-- backfill is safe and causes no search-document storm. Idempotent.
-- ============================================================================
alter table public.unified_tags disable trigger trg_sync_tag_category;

with primary_cat as (
  select distinct on (tag_id) tag_id, category_id
  from public.tag_category_assignments
  where category_id is not null
  order by tag_id, is_primary desc, created_at asc
)
update public.unified_tags t
set category_id = p.category_id
from primary_cat p
where t.id = p.tag_id
  and t.category_id is null;

alter table public.unified_tags enable trigger trg_sync_tag_category;
