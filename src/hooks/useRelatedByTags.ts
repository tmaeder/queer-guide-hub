import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RelatedByTagItem {
  type: string;
  id: string;
  title: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  image_url: string | null;
  tags: string[];
  /** Number of tags shared with the source entity. */
  overlap: number;
}

/**
 * Cross-entity "more like this by tag" — returns content of ANY type that
 * shares the most tags with the given entity, ranked by overlap. Reads the
 * denormalized `search_documents.facets->'tags'` via the `related_by_tags` RPC,
 * so it spans venues, events, news, marketplace, personalities and villages.
 */
async function fetchRelatedByTags(
  entityType: string,
  entityId: string,
  limit: number,
): Promise<RelatedByTagItem[]> {
  const { data, error } = await supabase.rpc('related_by_tags', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_limit: limit,
  });
  if (error || !data) {
    if (error) console.error('related_by_tags error:', error);
    return [];
  }
  return data as unknown as RelatedByTagItem[];
}

/** Imperative variant for callers that blend this with other sources. */
export function fetchRelatedByTagsClient(
  entityType: string,
  entityId: string,
  limit = 8,
): Promise<RelatedByTagItem[]> {
  return fetchRelatedByTags(entityType, entityId, limit);
}

export function useRelatedByTags(
  entityType: string | undefined,
  entityId: string | undefined,
  limit = 8,
) {
  return useQuery({
    queryKey: ['related-by-tags', entityType, entityId, limit],
    queryFn: () => fetchRelatedByTags(entityType!, entityId!, limit),
    enabled: !!entityType && !!entityId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
