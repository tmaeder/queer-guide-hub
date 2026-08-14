/**
 * Per-entity-type usage counts for ONE tag.
 *
 * Deliberately separate from `useTagUsageCounts`, which pulls a name→total map
 * for every tag in the corpus to drive the index's sort and filters. Widening
 * that query with four more columns would multiply a ~9k-row payload for a
 * number only the detail page shows.
 *
 * `tag_usage_summary` is a view over `unified_tag_assignments`; every `*_count`
 * is a disjoint `entity_type` bucket, so `total` is their sum and there is no
 * roll-up column to double-count.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TagUsageBreakdown {
  usage_count: number | null;
  venue_count: number;
  event_count: number;
  news_count: number;
  post_count: number;
  group_count: number;
  marketplace_count: number;
  content_count: number;
}

export function useTagUsageBreakdown(tagId: string | undefined) {
  return useQuery({
    queryKey: ['tag-usage-breakdown', tagId],
    enabled: !!tagId,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<TagUsageBreakdown | null> => {
      const { data, error } = await supabase
        .from('tag_usage_summary' as 'venues')
        .select(
          'usage_count, venue_count, event_count, news_count, post_count, group_count, marketplace_count, content_count',
        )
        .eq('id', tagId as string)
        .maybeSingle();
      if (error) {
        console.error('tag usage breakdown failed:', error);
        return null;
      }
      return (data ?? null) as unknown as TagUsageBreakdown | null;
    },
  });
}

export function totalUses(b: TagUsageBreakdown | null | undefined): number {
  if (!b) return 0;
  return (
    b.venue_count +
    b.event_count +
    b.news_count +
    b.post_count +
    b.group_count +
    b.marketplace_count +
    b.content_count
  );
}
