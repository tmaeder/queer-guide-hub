import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Gauge } from 'lucide-react';
import { useTagQualityScorecard } from '@/hooks/useTagQualityScorecard';

const GAP_LABELS: Record<string, string> = {
  description: 'No description',
  image: 'No image',
  category: 'Uncategorized',
  i18n: 'Untranslated',
  links: 'No wiki link',
  used: 'Unused',
  embedding: 'No embedding',
};

const BUCKETS: { key: keyof NonNullable<ReturnType<typeof useTagQualityScorecard>['data']>['buckets']; label: string }[] = [
  { key: 'p0_20', label: '0–20' },
  { key: 'p20_40', label: '20–40' },
  { key: 'p40_60', label: '40–60' },
  { key: 'p60_80', label: '60–80' },
  { key: 'p80_100', label: '80–100' },
];

/**
 * Content-quality scorecard for the active tag glossary: mean score, per-dimension
 * gap counts, and a score distribution. Counts come from tag_quality_scorecard(),
 * populated nightly by run_tag_quality_recompute().
 */
export function TagQualityPanel() {
  const { data } = useTagQualityScorecard();
  if (!data || !data.scored) return null;

  const { mean_score, scored, active_total, gaps, buckets, sensitive_unreviewed } = data;
  const maxBucket = Math.max(1, ...BUCKETS.map((b) => buckets[b.key] ?? 0));

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Gauge size={16} />
          Tag quality
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Stat label={`Mean score (${scored}/${active_total} scored)`} value={mean_score ?? 0} />
          {sensitive_unreviewed > 0 && (
            <Stat label="Sensitive · unreviewed" value={sensitive_unreviewed} hardFail />
          )}
        </div>

        <div>
          <div className="mb-2 text-13 text-muted-foreground">Missing data by dimension</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(gaps)
              .sort(([, a], [, b]) => b - a)
              .map(([key, count]) => (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-element border bg-muted/40 px-4 py-2"
                >
                  <span className="text-body-lg tabular-nums">{count}</span>
                  <span className="text-13 text-muted-foreground">{GAP_LABELS[key] ?? key}</span>
                </div>
              ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-13 text-muted-foreground">Score distribution</div>
          <div className="flex items-end gap-2 h-24">
            {BUCKETS.map((b) => {
              const v = buckets[b.key] ?? 0;
              return (
                <div key={b.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-13 tabular-nums text-muted-foreground">{v}</span>
                  <div
                    className="w-full rounded-element bg-foreground/80"
                    style={{ height: `${Math.round((v / maxBucket) * 72)}px` }}
                  />
                  <span className="text-2xs text-muted-foreground">{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>
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
        {hardFail && value > 0 && (
          <AlertTriangle size={12} style={{ color: 'hsl(var(--destructive))' }} />
        )}
        {label}
      </span>
    </div>
  );
}
