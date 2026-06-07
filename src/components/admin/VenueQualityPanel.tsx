import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Database, MapPin, Sparkles } from 'lucide-react';
import { useVenueQualitySummary } from '@/hooks/useVenueQualitySummary';

/**
 * Live venue content-quality summary: field coverage (% filled), the relevance-null
 * regression KPI, refresh backlog, coverage gaps, and DB headroom. Read-only — powered
 * by the venue_quality_stats() RPC.
 */
export function VenueQualityPanel() {
  const { data } = useVenueQualitySummary();
  if (!data) return null;
  const { liveVenues, missing, avgCompleteness, relevanceNull, needsAttention, neverRefreshed, coverageGaps, dbHeadroomMb } = data;
  if (!liveVenues) return null;

  const filledPct = (missingCount: number) =>
    liveVenues > 0 ? Math.round(((liveVenues - missingCount) / liveVenues) * 100) : 0;

  const fields: { label: string; missing: number }[] = [
    { label: 'Description', missing: missing.description },
    { label: 'Category', missing: missing.category },
    { label: 'Tags', missing: missing.tags },
    { label: 'Hours', missing: missing.hours },
    { label: 'Contact', missing: missing.phone_email },
    { label: 'Website', missing: missing.website },
    { label: 'Images', missing: missing.images },
    { label: 'Coords', missing: missing.coords },
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Sparkles size={16} />
          Venue content quality
          <span className="text-13 font-normal text-muted-foreground">
            {liveVenues.toLocaleString()} live · avg completeness {avgCompleteness}/100
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {fields.map((f) => (
            <FieldCoverage key={f.label} label={f.label} pct={filledPct(f.missing)} missing={f.missing} />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Stat label="Relevance unscored" value={relevanceNull} hardFail={relevanceNull > 0} />
          <Stat label="Needs review" value={needsAttention} />
          <Stat label="Never refreshed" value={neverRefreshed} />
          <Stat label="DB headroom (MB)" value={dbHeadroomMb} hardFail={dbHeadroomMb < 200} icon={<Database size={12} />} />
        </div>

        {coverageGaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <MapPin size={12} />
              Coverage gaps — cities with most thin venues
            </div>
            <div className="flex flex-wrap gap-2">
              {coverageGaps.map((g, i) => (
                <Badge key={`${g.city}-${i}`} variant="outline" className="font-normal">
                  {g.city} · {g.thin_count}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FieldCoverage({ label, pct, missing }: { label: string; pct: number; missing: number }) {
  return (
    <div className="rounded-element border bg-muted/40 px-4 py-2">
      <div className="flex items-baseline justify-between">
        <span className="text-13 text-muted-foreground">{label}</span>
        <span className="text-body-lg tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-badge bg-muted">
        <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-2xs text-muted-foreground tabular-nums">{missing.toLocaleString()} missing</div>
    </div>
  );
}

function Stat({ label, value, hardFail, icon }: { label: string; value: number; hardFail?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-element border bg-muted/40 px-4 py-2">
      <span
        className="text-headline tabular-nums"
        style={hardFail && value > 0 ? { color: 'hsl(var(--destructive))' } : undefined}
      >
        {value.toLocaleString()}
      </span>
      <span className="flex items-center gap-1 text-13 text-muted-foreground">
        {hardFail && value > 0 && <AlertTriangle size={12} style={{ color: 'hsl(var(--destructive))' }} />}
        {icon}
        {label}
      </span>
    </div>
  );
}
