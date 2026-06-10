import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accessibility, ShieldCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { useAmenityQualitySummary } from '@/hooks/useAmenityQualitySummary';

/**
 * Compact health summary for the Amenity Truth Engine: amenity + accessibility
 * coverage, pending accessibility reviews, needs-attention, and the emptiest
 * venues to backfill (from venues_due_for_amenity_backfill).
 */
export function AmenityQualityPanel() {
  const { data } = useAmenityQualitySummary();
  if (!data) return null;
  const { total, withAmenities, withAccessibility, needsAttention, reviewOpen, gaps } = data;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldCheck size={16} />
          Amenity & accessibility quality
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Stat label={`Amenity coverage (${pct(withAmenities)}%)`} value={withAmenities} />
          <Stat label={`Accessibility coverage (${pct(withAccessibility)}%)`} value={withAccessibility} icon={<Accessibility size={12} />} />
          <Stat label="Pending accessibility approvals" value={reviewOpen} hardFail={reviewOpen > 0} />
          <Stat label="Needs review" value={needsAttention} />
        </div>

        {gaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <Sparkles size={12} />
              Emptiest venues to backfill
            </div>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g) => (
                <Badge key={g.id} variant="outline" className="font-normal" title={g.category ?? ''}>
                  {g.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hardFail, icon }: { label: string; value: number; hardFail?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-element border bg-muted/40 px-4 py-2">
      <span className="text-headline tabular-nums" style={hardFail && value > 0 ? { color: 'hsl(var(--destructive))' } : undefined}>
        {value}
      </span>
      <span className="flex items-center gap-1 text-13 text-muted-foreground">
        {hardFail && value > 0 && <AlertTriangle size={12} style={{ color: 'hsl(var(--destructive))' }} />}
        {icon}
        {label}
      </span>
    </div>
  );
}
