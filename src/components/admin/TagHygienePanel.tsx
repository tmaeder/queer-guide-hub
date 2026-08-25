import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';
import { useTagHygieneStats, type TagHygieneStats } from '@/hooks/useTagHygieneStats';
import { HYGIENE_METRICS, type HygieneMetric } from '@/lib/tagHygieneMetrics';
import { AdminStat } from '@/components/admin/primitives/AdminStat';

/**
 * Live tag data-quality counters from `tag_hygiene_stats()`.
 *
 * The migration that created that function said it was "called by
 * scripts/check-tag-hygiene.mjs and rendered on /admin/tags". Only the first
 * half was true for a month: there was no frontend caller at all, so the six
 * advisory metrics — which CI deliberately warns on rather than fails — existed
 * only as a log line on a passing run. This panel is the second half. (The
 * route in that sentence was wrong too: `/admin/tags` redirects to the generic
 * CMS table; the tag panels live on `/admin/settings`, "Vocabularies".)
 *
 * It renders an explicit failure rather than returning null on error, unlike
 * the sibling quality panels: a blank space is exactly how this went unnoticed,
 * and the RPC reads the whole `events` corpus, so a statement timeout is a
 * plausible failure rather than a theoretical one.
 */
export function TagHygienePanel() {
  const { data, error, isLoading } = useTagHygieneStats();

  if (isLoading) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldCheck size={16} />
          Tag hygiene
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error || !data ? (
          <p className="text-13 text-destructive">
            tag_hygiene_stats() failed: {error instanceof Error ? error.message : 'no data'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <AdminStat label="Active tags" value={data.totals.active_tags} />
              <AdminStat label="Categories" value={data.totals.categories} />
              <AdminStat label="Assignments" value={data.totals.assignments} />
            </div>

            <MetricGroup
              title="Invariants — CI fails when these grow"
              metrics={HYGIENE_METRICS.filter((m) => !m.advisory)}
              stats={data}
            />
            <MetricGroup
              title="Gauges — CI only warns, so this is where they are watched"
              metrics={HYGIENE_METRICS.filter((m) => m.advisory)}
              stats={data}
            />

            <p className="text-13 text-muted-foreground">
              Counts are live. The ratchet lives in CI — <code>scripts/check-tag-hygiene.mjs</code>{' '}
              compares every counter against <code>scripts/tag-hygiene-baseline.json</code> and
              fails only on growth. Re-baseline with <code>--update</code> after a cleanup; never
              loosen a number to make CI pass.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MetricGroup({
  title,
  metrics,
  stats,
}: {
  title: string;
  metrics: HygieneMetric[];
  stats: TagHygieneStats;
}) {
  return (
    <div>
      <div className="mb-2 text-13 text-muted-foreground">{title}</div>
      <div className="flex flex-col gap-2">
        {metrics.map((m) => (
          <div key={m.key} className="flex flex-wrap items-center gap-2">
            <AdminStat label={m.label} value={stats[m.key]} hardFail={m.zero} />
            {m.hint && <span className="max-w-prose text-13 text-muted-foreground">{m.hint}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
