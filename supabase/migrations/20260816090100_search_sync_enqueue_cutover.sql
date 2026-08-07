-- ============================================================================
-- Search sync cutover: per-row inline reindex → enqueue-only — Phase 1b
-- ----------------------------------------------------------------------------
-- Body-swap of search_documents_sync(). ZERO trigger DDL: all ~20
-- trg_search_documents_* triggers (names, UPDATE OF column lists, geo_places
-- WHEN clauses) keep pointing at this function and are untouched.
--
-- Out of scope, deliberately: search_documents_sync_embedding()
-- (content_embeddings) and search_documents_sync_landmark_profile()
-- (geo_landmark_profiles) stay inline — low-volume tables, not the brake.
--
-- ROLLBACK (one statement, instant): re-create search_documents_sync() with
-- the body of search_documents_sync_inline_legacy() below, which is the
-- verbatim live body captured from pg_proc.prosrc on 2026-08-07:
--   CREATE OR REPLACE FUNCTION public.search_documents_sync() ... copy body.
-- The queue and drain then sit idle (drain of an empty queue is a no-op).
-- ============================================================================

-- Reference copy of the pre-cutover body (kept as a real function so the
-- rollback source lives in the schema, not just in this file).
CREATE OR REPLACE FUNCTION public.search_documents_sync_inline_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  begin
    if (tg_op = 'DELETE') then
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = old.id;
    else
      delete from public.search_documents where entity_type = tg_argv[0] and entity_id = new.id;
      case tg_argv[0]
        when 'venue'         then perform public.search_documents_index_venues(new.id);
        when 'event'         then perform public.search_documents_index_events(new.id);
        when 'city'          then perform public.search_documents_index_cities(new.id);
        when 'country'       then perform public.search_documents_index_countries(new.id);
        when 'news'          then perform public.search_documents_index_news(new.id);
        when 'marketplace'   then perform public.search_documents_index_marketplace(new.id);
        when 'personality'   then perform public.search_documents_index_personalities(new.id);
        when 'tag'           then perform public.search_documents_index_tags(new.id);
        when 'queer_village' then perform public.search_documents_index_villages(new.id);
        when 'group'         then perform public.search_documents_index_groups(new.id);
        when 'organization'  then perform public.search_documents_index_organizations(new.id);
        when 'milestone'     then perform public.search_documents_index_milestones(new.id);
        when 'guide'         then perform public.search_documents_index_guides(new.id);
        else null;
      end case;
    end if;
  exception when others then null;
  end;
  return coalesce(new, old);
end
$function$;

COMMENT ON FUNCTION public.search_documents_sync_inline_legacy() IS
  'Pre-2026-08 inline body of search_documents_sync(), kept verbatim as the rollback source for the enqueue cutover (20260816090100). Not attached to any trigger.';

-- The cutover: entity writes now cost one queue INSERT (~µs) instead of a
-- full doc delete + reindex + HNSW churn. The exception guard is preserved —
-- search freshness must never break an entity transaction.
CREATE OR REPLACE FUNCTION public.search_documents_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  begin
    insert into public.search_reindex_queue (entity_type, entity_id)
    values (tg_argv[0], coalesce(new.id, old.id));
  exception when others then null;
  end;
  return coalesce(new, old);
end
$function$;

COMMENT ON FUNCTION public.search_documents_sync() IS
  'Trigger body since 2026-08 (pipeline overhaul P1): enqueues (entity_type, entity_id) into search_reindex_queue; search_reindex_drain() applies the reindex within ~1 minute. Rollback = re-create with the body of search_documents_sync_inline_legacy().';
