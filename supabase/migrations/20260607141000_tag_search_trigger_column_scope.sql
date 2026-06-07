-- Scope the unified_tags -> search_documents sync trigger to fire only on
-- search-relevant columns. search_documents_index_tags reads name,
-- short_description, description, category, slug, image_url, entity_kind and
-- filters on merged_into_id/deprecated_at — nothing else. Previously the trigger
-- fired on ANY column UPDATE, so quality_score / quality_breakdown / *_i18n /
-- confidence recomputes triggered a wasteful per-row HNSW re-index. This makes
-- the nightly tag_quality_recompute and i18n backfills cheap and avoids the
-- mass-update search-trigger fan-out hazard.
DROP TRIGGER IF EXISTS trg_search_documents_tag ON public.unified_tags;
CREATE TRIGGER trg_search_documents_tag
  AFTER INSERT OR DELETE OR UPDATE OF
    name, short_description, description, category, slug, image_url,
    entity_kind, merged_into_id, deprecated_at, status
  ON public.unified_tags
  FOR EACH ROW EXECUTE FUNCTION search_documents_sync('tag');
