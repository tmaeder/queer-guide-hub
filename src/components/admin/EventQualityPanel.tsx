import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, MapPin, ShieldCheck } from 'lucide-react';
import { useEventQualitySummary } from '@/hooks/useEventQualitySummary';

/**
 * Compact health summary for the Continuous Event Truth Loop:
 * needs-review / low-trust / liveness-failure counts, plus the top coverage
 * gaps surfaced by run_event_coverage_radar().
 */
export function EventQualityPanel() {
  const { data } = useEventQualitySummary();
  if (!data) return null;
  const { gaps, needsAttention, livenessFail, lowTrust } = data;
  if (!gaps.length && !needsAttention && !livenessFail && !lowTrust) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldCheck size={16} />
          Event quality
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Stat label="Needs review" value={needsAttention} />
          <Stat label="Low trust (upcoming)" value={lowTrust} />
          <Stat label="Cancelled / dead link" value={livenessFail} hardFail={livenessFail > 0} />
        </div>

        {gaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <MapPin size={12} />
              Coverage gaps — thinnest cities
            </div>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g, i) => (
                <Badge key={`${g.city_name ?? 'unknown'}-${i}`} variant="outline" className="font-normal">
                  {g.city_name ?? 'Unknown'} · {g.upcoming_count}
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
      <span
        className="text-headline tabular-nums"
        style={hardFail && value > 0 ? { color: 'hsl(var(--destructive))' } : undefined}
      >
        {value}
      </span>
      <span className="flex items-center gap-1 text-13 text-muted-foreground">
        {hardFail && value > 0 && <AlertTriangle size={12} style={{ color: 'hsl(var(--destructive))' }} />}
        {label}
      </span>
    </div>
  );
}
