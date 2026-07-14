import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

export function useEntityData(item: TriageItem) {
  const entityId = item.entity_id;
  const entityTable = item.entity_table;

  return useQuery({
    queryKey: ['entity-preview', entityTable, entityId],
    queryFn: async () => {
      if (!entityId || !entityTable) return null;
      const validTables = ['venues', 'events', 'news_articles', 'personalities', 'cities', 'countries', 'marketplace_listings'];
      if (!validTables.includes(entityTable)) return null;
      const { data, error } = await untypedFrom(entityTable)
        .select('*')
        .eq('id', entityId)
        .maybeSingle();
      if (error) return null;
      return data as Record<string, unknown> | null;
    },
    enabled: !!entityId && !!entityTable,
    staleTime: 60_000,
  });
}

export function useStagingData(item: TriageItem) {
  return useQuery({
    queryKey: ['staging-detail', item.id],
    queryFn: async () => {
      if (item.queue_type !== 'staging') return null;
      const { data, error } = await untypedFrom('ingestion_staging')
        .select('raw_data, normalized_data, enriched_data, dedup_match_id, dedup_match_table, dedup_match_score, ai_confidence_score, source_type, target_table')
        .eq('id', item.id)
        .maybeSingle();
      if (error) return null;
      return data as Record<string, unknown> | null;
    },
    enabled: item.queue_type === 'staging',
    staleTime: 60_000,
  });
}

const DEDUP_MATCH_TABLES = ['venues', 'events', 'news_articles', 'personalities', 'cities', 'countries', 'marketplace_listings', 'organizations', 'hotels'];

/** Fetches the live entity a staging row's dedup pass matched against, so the
 * admin can compare incoming data with what's already published. */
export function useDedupMatchData(stagingData: Record<string, unknown> | null | undefined) {
  const matchId = stagingData?.dedup_match_id as string | null | undefined;
  const matchTable = stagingData?.dedup_match_table as string | null | undefined;
  const enabled = !!matchId && !!matchTable && DEDUP_MATCH_TABLES.includes(matchTable);

  return useQuery({
    queryKey: ['dedup-match', matchTable, matchId],
    queryFn: async () => {
      const { data, error } = await untypedFrom(matchTable as string)
        .select('*')
        .eq('id', matchId as string)
        .maybeSingle();
      if (error) return null;
      return data as Record<string, unknown> | null;
    },
    enabled,
    staleTime: 60_000,
  });
}
