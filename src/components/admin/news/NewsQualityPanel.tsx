import { Badge } from '@/components/ui/badge';
import { Gauge, ShieldCheck } from 'lucide-react';
import { useNewsQualitySummary } from '@/hooks/useNewsQualitySummary';

/**
 * Global content-quality coverage snapshot for live news articles
 * (news_quality_scorecard view). Surfaces the missing-data gaps that Phase 1
 * backfill targets — geo, city, tags, thin content, images, authors — plus
 * average completeness/relevance and corroboration.
 */
export function NewsQualityPanel() {
  const { data } = useNewsQualitySummary();
  if (!data || !data.total_live) return null;

  const total = data.total_live;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  // Coverage gaps, worst first. Each is "missing", so higher % = worse.
  const gaps: { label: string; missing: number }[] = [
    { label: 'No city', missing: data.no_city },
    { label: 'No tags', missing: data.no_tags },
    { label: 'Thin (<500)', missing: data.thin_lt500 },
    { label: 'No image', missing: data.no_image },
    { label: 'No geo', missing: data.no_geo },
    { label: 'Thin (<200)', missing: data.thin_lt200 },
    { label: 'No author', missing: data.no_author },
  ].sort((a, b) => b.missing - a.missing);

  return (
    <div className="border border-border rounded-element bg-background overflow-hidden">
      <div className="px-4 py-2 border-b border-border text-xs font-semibold text-muted-foreground flex items-center gap-2 flex-wrap">
        <ShieldCheck className="h-3.5 w-3.5" />
        News content quality
        <Badge variant="outline" className="text-2xs px-1.5 py-0">{total.toLocaleString()} live</Badge>
        <span className="ml-auto flex items-center gap-2 font-normal normal-case tracking-normal">
          <span className="flex items-center gap-1">
            <Gauge className="h-3 w-3" />
            avg completeness <strong className="tabular-nums">{data.avg_quality ?? '–'}</strong>/100
          </span>
          <span>avg relevance <strong className="tabular-nums">{data.avg_relevance ?? '–'}</strong></span>
          <span>{data.corroborated.toLocaleString()} corroborated</span>
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-px bg-border">
        {gaps.map((g) => (
          <div key={g.label} className="bg-background p-4">
            <div className="text-2xl font-bold tabular-nums">{pct(g.missing)}%</div>
            <div className="text-xs2 text-muted-foreground mt-0.5">{g.label}</div>
            <div className="text-3xs text-muted-foreground/70 tabular-nums">{g.missing.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
