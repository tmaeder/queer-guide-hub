import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ShieldCheck, AlertTriangle } from 'lucide-react';
import { usePersonalityQualitySummary } from '@/hooks/usePersonalityQualitySummary';

/**
 * Compact health summary for the Personality Truth Engine: publishable backlog,
 * adult consent candidates, needs-review / low-completeness counts, plus the top
 * coverage gaps surfaced by run_personality_coverage_radar().
 */
export function PersonalityQualityPanel() {
  const { data } = usePersonalityQualitySummary();
  if (!data) return null;
  const { gaps, publicCount, needsAttention, reviewOpen, lowCompleteness, promotable, adultConsentCandidates } = data;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldCheck size={16} />
          Personality quality
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Stat label="Public" value={publicCount} />
          <Stat label="Promotable (auto-gate)" value={promotable} />
          <Stat label="Adult consent candidates" value={adultConsentCandidates} />
          <Stat label="Pending review" value={reviewOpen} hardFail={reviewOpen > 0} />
          <Stat label="Needs review" value={needsAttention} />
          <Stat label="Low completeness" value={lowCompleteness} />
        </div>

        {gaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <Users size={12} />
              Coverage gaps — emptiest profiles to enrich
            </div>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g) => (
                <Badge key={g.personality_id} variant="outline" className="font-normal" title={(g.missing_fields ?? []).join(', ')}>
                  {g.personality_name ?? 'Unknown'} · {g.gap_score}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hardFail }: { label: string; value: number; hardFail?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-element border bg-muted/40 px-4 py-2">
      <span className="text-headline tabular-nums" style={hardFail && value > 0 ? { color: 'hsl(var(--destructive))' } : undefined}>
        {value}
      </span>
      <span className="flex items-center gap-1 text-13 text-muted-foreground">
        {hardFail && value > 0 && <AlertTriangle size={12} style={{ color: 'hsl(var(--destructive))' }} />}
        {label}
      </span>
    </div>
  );
}
