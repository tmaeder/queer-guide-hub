import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, ShieldCheck } from 'lucide-react';
import { useVillageQualitySummary } from '@/hooks/useVillageQualitySummary';

/**
 * Compact health summary for the Village Truth Engine: completeness average,
 * venue-linkage coverage, pending reviews, ghost shells, plus the emptiest
 * villages surfaced by run_village_coverage_radar().
 */
export function VillageQualityPanel() {
  const { data } = useVillageQualitySummary();
  if (!data) return null;
  const { gaps, total, withVenues, reviewOpen, lowCompleteness, ghosts, avgCompleteness } = data;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldCheck size={16} />
          Village quality
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Stat label="Avg completeness" value={avgCompleteness} />
          <Stat label={`Have venues (of ${total})`} value={withVenues} />
          <Stat label="Pending reviews" value={reviewOpen} />
          <Stat label="Low completeness" value={lowCompleteness} />
          <Stat label="Ghost shells (no venues)" value={ghosts} />
        </div>

        {gaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <MapPin size={12} />
              Coverage gaps — emptiest villages to enrich
            </div>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g) => (
                <Badge key={g.village_id} variant="outline" className="font-normal" title={(g.missing_fields ?? []).join(', ')}>
                  {g.village_name ?? 'Unknown'} · {g.gap_score}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-element border bg-muted/40 px-4 py-2">
      <span className="text-headline tabular-nums">{value}</span>
      <span className="text-13 text-muted-foreground">{label}</span>
    </div>
  );
}
