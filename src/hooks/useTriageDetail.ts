import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
      const { data, error } = await supabase
        .from(entityTable as never)
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
      const { data, error } = await supabase
        .from('ingestion_staging' as never)
        .select('raw_data, normalized_data, enriched_data, dedup_match_id, dedup_match_table')
        .eq('id', item.id)
        .maybeSingle();
      if (error) return null;
      return data as Record<string, unknown> | null;
    },
    enabled: item.queue_type === 'staging',
    staleTime: 60_000,
  });
}
