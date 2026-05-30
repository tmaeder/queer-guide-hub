import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CoverageGap {
  city_name: string | null;
  upcoming_count: number;
  suggested_queries: { source: string; q: string }[] | null;
}

export interface EventQualitySummary {
  gaps: CoverageGap[];
  needsAttention: number;
  livenessFail: number;
  lowTrust: number;
}

/** Health summary for the Continuous Event Truth Loop (coverage gaps + counts). */
export function useEventQualitySummary() {
  return useQuery<EventQualitySummary>({
    queryKey: ['event-quality-summary'],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [gaps, needsAttention, livenessFail, lowTrust] = await Promise.all([
        supabase
          .from('event_coverage_gaps')
          .select('city_name, upcoming_count, suggested_queries')
          .eq('status', 'open')
          .order('upcoming_count', { ascending: true })
          .limit(8),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('needs_attention', true).is('duplicate_of_id', null),
        supabase.from('events').select('id', { count: 'exact', head: true }).in('liveness_status', ['cancelled', 'dead_link']).is('duplicate_of_id', null),
        supabase.from('events').select('id', { count: 'exact', head: true }).lt('trust_score', 40).gt('start_date', nowIso).is('duplicate_of_id', null),
      ]);
      return {
        gaps: (gaps.data ?? []) as CoverageGap[],
        needsAttention: needsAttention.count ?? 0,
        livenessFail: livenessFail.count ?? 0,
        lowTrust: lowTrust.count ?? 0,
      };
    },
    staleTime: 60_000,
  });
}
