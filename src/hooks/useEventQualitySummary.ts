import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CoverageGap {
  city_name: string | null;
  upcoming_count: number;
  suggested_queries: { source: string; q: string }[] | null;
}

export interface FieldCoverage {
  field: string;
  pctComplete: number;
}

export interface EventQualitySummary {
  gaps: CoverageGap[];
  needsAttention: number;
  livenessFail: number;
  lowTrust: number;
  coverage: FieldCoverage[];
  avgQuality: number | null;
  avgTrust: number | null;
  total: number | null;
}

interface CoverageRow {
  data_source: string;
  total: number;
  pct_no_desc: number;
  pct_no_end: number;
  pct_no_tz: number;
  pct_no_venue: number;
  pct_no_img: number;
  pct_no_geo: number;
  pct_no_target: number;
  pct_no_a11y: number;
  avg_quality: number | null;
  avg_trust: number | null;
}

const pct = (missing: number | null | undefined) =>
  Math.max(0, Math.min(100, Math.round(100 - Number(missing ?? 100))));

/** Health summary for the Continuous Event Truth Loop (coverage gaps + counts). */
export function useEventQualitySummary() {
  return useQuery<EventQualitySummary>({
    queryKey: ['event-quality-summary'],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [gaps, needsAttention, livenessFail, lowTrust, coverage] = await Promise.all([
        supabase
          .from('event_coverage_gaps')
          .select('city_name, upcoming_count, suggested_queries')
          .eq('status', 'open')
          .order('upcoming_count', { ascending: true })
          .limit(8),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('needs_attention', true).is('duplicate_of_id', null),
        supabase.from('events').select('id', { count: 'exact', head: true }).in('liveness_status', ['cancelled', 'dead_link']).is('duplicate_of_id', null),
        supabase.from('events').select('id', { count: 'exact', head: true }).lt('trust_score', 40).gt('start_date', nowIso).is('duplicate_of_id', null),
        supabase.rpc('event_field_coverage'),
      ]);

      const all = ((coverage.data ?? []) as CoverageRow[]).find((r) => r.data_source === 'ALL');
      const fieldCoverage: FieldCoverage[] = all
        ? [
            { field: 'Description', pctComplete: pct(all.pct_no_desc) },
            { field: 'Image', pctComplete: pct(all.pct_no_img) },
            { field: 'Location', pctComplete: pct(all.pct_no_geo) },
            { field: 'Timezone', pctComplete: pct(all.pct_no_tz) },
            { field: 'End date', pctComplete: pct(all.pct_no_end) },
            { field: 'Venue', pctComplete: pct(all.pct_no_venue) },
            { field: 'Target groups', pctComplete: pct(all.pct_no_target) },
            { field: 'Accessibility', pctComplete: pct(all.pct_no_a11y) },
          ]
        : [];

      return {
        gaps: (gaps.data ?? []) as CoverageGap[],
        needsAttention: needsAttention.count ?? 0,
        livenessFail: livenessFail.count ?? 0,
        lowTrust: lowTrust.count ?? 0,
        coverage: fieldCoverage,
        avgQuality: all?.avg_quality ?? null,
        avgTrust: all?.avg_trust ?? null,
        total: all?.total ?? null,
      };
    },
    staleTime: 60_000,
  });
}
