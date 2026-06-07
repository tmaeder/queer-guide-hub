import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, AlertTriangle } from 'lucide-react';
import { usePersonalityQualityOverview } from '@/hooks/usePersonalityQualityOverview';

/**
 * Compact cohort-health summary for the personalities admin page. Surfaces the
 * state produced by the content-quality remediation: Wikidata reconciliation
 * coverage, the re-queue drain still in flight, the archived adult cohort, the
 * "insufficient data" triage bucket (bare-name rows needing a human), and any
 * low-confidence auto-matches worth a glance.
 */
export function PersonalityQualityPanel() {
  const { data } = usePersonalityQualityOverview();
  if (!data) return null;

  const pct = data.anchored_pct ?? 0;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Users size={16} />
          Personality data quality
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Stat label="Wikidata-anchored" value={`${data.anchored.toLocaleString()} · ${pct}%`} />
          <Stat label="Active records" value={data.active.toLocaleString()} />
          <Stat label="Re-queued (draining)" value={data.pending_requeue.toLocaleString()} />
          <Stat label="No Wikidata match (skip)" value={data.skip_sentinel.toLocaleString()} />
          <Stat label="Archived (unanchored adult)" value={data.archived.toLocaleString()} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Stat label="Sourced connection" value={data.has_connection.toLocaleString()} />
          <Stat label="Needs human review (thin)" value={data.triage_insufficient.toLocaleString()} />
          <Stat label="Flagged non-person" value={data.flagged_nonperson.toLocaleString()} />
          <Stat label="Needs attention" value={data.needs_attention.toLocaleString()} />
          <Stat label="Bio-extractable" value={data.bio_extractable.toLocaleString()} />
          <Stat
            label="Low-confidence matches"
            value={data.low_confidence_matches.toLocaleString()}
            warn={data.low_confidence_matches > 0}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-element border bg-muted/40 px-4 py-2">
      <span className="text-headline tabular-nums">{value}</span>
      <span className="flex items-center gap-1 text-13 text-muted-foreground">
        {warn && <AlertTriangle size={12} />}
        {label}
      </span>
    </div>
  );
}
