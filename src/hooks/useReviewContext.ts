import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { ReviewItem } from './useAdminReview';

const TABLES = new Set([
  'venues',
  'events',
  'news_articles',
  'personalities',
  'cities',
  'countries',
  'queer_villages',
  'marketplace_listings',
  'marketplace_brands',
  'organizations',
  'unified_tags',
  'milestones',
  'hotels',
]);
export interface ReviewContext {
  record: Record<string, unknown> | null;
  location: string | null;
  signals: Record<string, unknown>[];
  candidate?: Record<string, unknown> | null;
}
export function useReviewContext(item: ReviewItem, candidateOrganizationId?: string | null) {
  const { user } = useAuth();
  const table = item.entity_table === 'tag' ? 'unified_tags' : item.entity_table;
  const proposed = item.meta?.org as { id?: string } | undefined;
  const candidateId =
    item.queue_type === 'org-link-review'
      ? candidateOrganizationId === undefined
        ? proposed?.id
        : candidateOrganizationId
      : null;
  return useQuery({
    queryKey: [
      'review-context',
      user?.id,
      item.queue_type,
      table,
      item.entity_id,
      ...(candidateId ? [candidateId] : []),
    ],
    enabled: !!user?.id && !!item.entity_id && !!table && TABLES.has(table),
    queryFn: async ({ signal }): Promise<ReviewContext> => {
      const { data, error } = await untypedFrom(table!)
        .select('*')
        .eq('id', item.entity_id!)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const record = data as Record<string, unknown> | null;
      const names = await Promise.all(
        (['cities', 'countries'] as const).map(async (lookup) => {
          const id = record?.[lookup === 'cities' ? 'city_id' : 'country_id'];
          if (typeof id !== 'string') return null;
          const result = await untypedFrom(lookup)
            .select('name')
            .eq('id', id)
            .abortSignal(signal)
            .maybeSingle();
          if (result.error) throw new Error(result.error.message);
          return (result.data as { name?: string } | null)?.name ?? null;
        }),
      );
      let signals: Record<string, unknown>[] = [];
      if (item.queue_type === 'liveness') {
        const result = await untypedFrom('entity_existence_signals')
          .select('signal_kind,verdict,source,details,observed_at')
          .eq('entity_type', item.content_type)
          .eq('entity_id', item.entity_id!)
          .order('observed_at', { ascending: false })
          .limit(12)
          .abortSignal(signal);
        if (result.error) throw new Error(result.error.message);
        signals = (result.data ?? []) as Record<string, unknown>[];
      }
      let candidate: Record<string, unknown> | null = null;
      if (candidateId) {
        const result = await untypedFrom('organizations')
          .select('name,address,website,email,phone,description,status')
          .eq('id', candidateId)
          .abortSignal(signal)
          .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        candidate = result.data as Record<string, unknown> | null;
      }
      return { record, location: names.filter(Boolean).join(', ') || null, signals, candidate };
    },
    staleTime: 0,
  });
}
