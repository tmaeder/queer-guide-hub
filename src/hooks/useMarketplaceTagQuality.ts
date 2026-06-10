import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEPARTMENT_ORDER, departmentOf } from '@/lib/marketplaceTaxonomy';

export interface TagQualitySummary {
  totalActive: number;
  attributeAssignments: number;
  openReviews: number;
  departments: Array<{ slug: string; count: number }>;
}

/** Live counts for the marketplace tag engine admin panel. */
export function useMarketplaceTagQuality() {
  return useQuery<TagQualitySummary>({
    queryKey: ['marketplace-tag-quality'],
    queryFn: async () => {
      const [subcats, assignments, reviews, total] = await Promise.all([
        supabase.rpc('get_marketplace_subcategory_counts'),
        supabase
          .from('unified_tag_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('entity_type', 'marketplace_listing'),
        supabase
          .from('marketplace_review_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from('marketplace_listings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),
      ]);
      const counts = new Map<string, number>();
      type Row = { slug: string | null; count: number | string | null };
      for (const r of (subcats.data ?? []) as Row[]) {
        if (!r.slug || r.count == null) continue;
        const d = departmentOf(r.slug);
        const n = typeof r.count === 'string' ? parseInt(r.count, 10) : r.count;
        counts.set(d, (counts.get(d) ?? 0) + n);
      }
      return {
        totalActive: total.count ?? 0,
        attributeAssignments: assignments.count ?? 0,
        openReviews: reviews.count ?? 0,
        departments: DEPARTMENT_ORDER
          .filter((d) => (counts.get(d) ?? 0) > 0)
          .map((d) => ({ slug: d, count: counts.get(d) ?? 0 })),
      };
    },
    staleTime: 60_000,
  });
}
