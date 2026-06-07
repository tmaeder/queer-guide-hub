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

export interface SourceGap {
  source: string;
  total: number;
  field: string;
  pctMissing: number;
}

export interface EventQualitySummary {
  gaps: CoverageGap[];
  needsAttention: number;
  livenessFail: number;
  lowTrust: number;
  coverage: FieldCoverage[];
  sourceGaps: SourceGap[];
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
  pct_no_url: number;
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

      const rows = (coverage.data ?? []) as CoverageRow[];
      const all = rows.find((r) => r.data_source === 'ALL');

      // Per-source actionable leaks: the worst of the source-shaped fields
      // (image / URL / location) for each source with enough volume. Lets
      // operators fix the gap upstream instead of backfilling forever.
      const FIELDS: { key: keyof CoverageRow; label: string }[] = [
        { key: 'pct_no_img', label: 'image' },
        { key: 'pct_no_url', label: 'URL' },
        { key: 'pct_no_end', label: 'end date' },
      ];
      const sourceGaps: SourceGap[] = rows
        .filter((r) => r.data_source !== 'ALL' && r.total >= 20)
        .map((r) => {
          const worst = FIELDS.map((f) => ({ field: f.label, pctMissing: Number(r[f.key] ?? 0) }))
            .sort((a, b) => b.pctMissing - a.pctMissing)[0];
          return { source: r.data_source, total: r.total, field: worst.field, pctMissing: worst.pctMissing };
        })
        .filter((s) => s.pctMissing >= 50)
        .sort((a, b) => b.pctMissing - a.pctMissing || b.total - a.total)
        .slice(0, 6);
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
        sourceGaps,
        avgQuality: all?.avg_quality ?? null,
        avgTrust: all?.avg_trust ?? null,
        total: all?.total ?? null,
      };
    },
    staleTime: 60_000,
  });
}
