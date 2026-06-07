import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useCityQualitySummary } from '@/hooks/useCityQualitySummary';

/**
 * Compact health summary for the City Truth Engine: needs-review /
 * pending-rating-approvals / low-completeness / ghost counts, plus the top
 * coverage gaps surfaced by run_city_coverage_radar().
 */
export function CityQualityPanel() {
  const { data } = useCityQualitySummary();
  if (!data) return null;
  const { gaps, needsAttention, reviewOpen, lowCompleteness, ghosts } = data;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldCheck size={16} />
          City quality
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Stat label="Pending rating/safety approvals" value={reviewOpen} hardFail={reviewOpen > 0} />
          <Stat label="Needs review" value={needsAttention} />
          <Stat label="Low completeness" value={lowCompleteness} />
          <Stat label="Ghost shells" value={ghosts} />
        </div>

        {gaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <MapPin size={12} />
              Coverage gaps — emptiest cities to enrich
            </div>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g) => (
                <Badge key={g.city_id} variant="outline" className="font-normal" title={(g.missing_fields ?? []).join(', ')}>
                  {g.city_name ?? 'Unknown'} · {g.gap_score}
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
