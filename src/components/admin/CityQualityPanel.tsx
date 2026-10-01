import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCityQualitySummary } from '@/hooks/useCityQualitySummary';
import { AdminStat } from '@/components/admin/primitives/AdminStat';

/**
 * Compact health summary for the City Truth Engine: needs-review /
 * pending-rating-approvals / low-completeness / ghost counts, plus the top
 * coverage gaps surfaced by run_city_coverage_radar().
 */
export function CityQualityPanel() {
  const { data, isLoading, error, refetch, isFetching } = useCityQualitySummary();

  if (isLoading) {
    return (
      <Card className="mb-6" aria-busy="true">
        <CardContent className="py-6 text-13 text-muted-foreground">
          Running the city quality probe…
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-bold text-destructive">
              <AlertTriangle size={16} aria-hidden />
              City quality probe did not run
            </p>
            <p className="mt-1 max-w-prose text-13 text-muted-foreground">
              {error instanceof Error ? error.message : 'No scorecard was returned.'} Counts are
              unavailable; this is not a zero-finding result.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : undefined} aria-hidden />
            Retry probe
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { gaps, needsAttention, reviewOpen, lowCompleteness, ghosts, scorecard } = data;
  const issueCohorts = Object.entries(scorecard.issues)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const dimensionEntries = Object.entries(scorecard.dimensions);
  const latestTrend = scorecard.trends[0];

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
          <AdminStat label="Publication ready" value={scorecard.totals.publication_ready} />
          <AdminStat
            label="Indexable with hard blockers"
            value={scorecard.totals.publication_blocked}
            hardFail
          />
          <AdminStat
            label="Pending rating/safety approvals"
            value={reviewOpen}
            hardFail={reviewOpen > 0}
          />
          <AdminStat label="Needs review" value={needsAttention} />
          <AdminStat label="Low completeness" value={lowCompleteness} />
          <AdminStat label="Ghost shells" value={ghosts} />
          <AdminStat
            label="Verified city images"
            value={scorecard.operations.verified_city_images}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-13">
          <Badge variant={scorecard.automation.fresh ? 'secondary' : 'destructive'}>
            Quality sync {scorecard.automation.fresh ? 'fresh' : 'stale or missing'}
          </Badge>
          {scorecard.operations.image_automation_no_progress && (
            <Badge variant="destructive">
              Image worker stalled with {scorecard.operations.image_automation_backlog} remaining
            </Badge>
          )}
          <span className="text-muted-foreground">
            {scorecard.operations.oldest_unresolved_issue
              ? `Oldest unresolved issue: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(scorecard.operations.oldest_unresolved_issue))}`
              : 'No unresolved city quality issue is currently queued.'}
          </span>
          {latestTrend && (
            <span className="text-muted-foreground">
              Latest snapshot: {latestTrend.publication_blocked} blocked ·{' '}
              {latestTrend.publication_ready} ready
            </span>
          )}
        </div>

        <div>
          <div className="mb-2 text-13 text-muted-foreground">Dimension averages · 0–100</div>
          <div className="flex flex-wrap gap-2">
            {dimensionEntries.map(([dimension, score]) => (
              <Badge key={dimension} variant="outline" className="font-normal tabular-nums">
                {humanizeCode(dimension)} · {score == null ? 'unavailable' : Math.round(score)}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-13 text-muted-foreground">Largest issue cohorts</div>
          {issueCohorts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {issueCohorts.map(([code, count]) => (
                <Badge key={code} variant="outline" className="max-w-full font-normal">
                  <span className="truncate">{humanizeCode(code)}</span>
                  <span className="tabular-nums">· {count}</span>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-13 text-muted-foreground">Probe completed with zero findings.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-13 text-muted-foreground">
          <span>{scorecard.operations.unlinked_venues.toLocaleString()} unlinked venues</span>
          <span>{scorecard.operations.unlinked_events.toLocaleString()} unlinked events</span>
          <span>{scorecard.operations.other_venues.toLocaleString()} venues in “other”</span>
          <span>{scorecard.operations.other_events.toLocaleString()} events in “other”</span>
          <span>
            {scorecard.operations.ghosts_with_live_children.toLocaleString()} ghosts with live
            children
          </span>
          <span>
            {scorecard.operations.merged_rows_with_live_children.toLocaleString()} merged rows with
            live children
          </span>
          <span>
            {scorecard.operations.descriptions_with_provenance.toLocaleString()} descriptions with
            provenance
          </span>
        </div>

        {gaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <MapPin size={12} />
              Coverage gaps — emptiest cities to enrich
            </div>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g) => (
                <Badge
                  key={g.city_id}
                  variant="outline"
                  className="font-normal"
                  title={(g.missing_fields ?? []).join(', ')}
                >
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

function humanizeCode(value: string): string {
  return value
    .replace(/^CITY_/, '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
