import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, ShieldCheck } from 'lucide-react';
import { useEventQualitySummary } from '@/hooks/useEventQualitySummary';
import { AdminStat } from '@/components/admin/primitives/AdminStat';

interface EventQualityPanelProps {
  onIssueFilter?: (issueCode: string) => void;
}

/**
 * Compact health summary for the Continuous Event Truth Loop:
 * needs-review / low-trust / liveness-failure counts, plus the top coverage
 * gaps surfaced by run_event_coverage_radar().
 */
export function EventQualityPanel({ onIssueFilter }: EventQualityPanelProps) {
  const { data } = useEventQualitySummary();
  if (!data) return null;
  const {
    gaps,
    needsAttention,
    livenessFail,
    lowTrust,
    coverage,
    sourceGaps,
    avgQuality,
    avgTrust,
    total,
    programme,
    programmeError,
  } = data;
  if (!gaps.length && !needsAttention && !livenessFail && !lowTrust && !coverage.length)
    return null;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <ShieldCheck size={16} />
          Event quality
          {avgQuality != null && (
            <span className="ml-auto text-13 font-normal text-muted-foreground tabular-nums">
              {total != null && <>{total.toLocaleString()} events · </>}
              legacy quality {avgQuality} · legacy trust {avgTrust}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <AdminStat label="Needs review" value={needsAttention} />
          <AdminStat label="Low trust (upcoming)" value={lowTrust} />
          <AdminStat
            label="Cancelled / dead link"
            value={livenessFail}
            hardFail={livenessFail > 0}
          />
          {programme && (
            <>
              <AdminStat
                label="Assessed"
                value={`${programme.totals.assessed}/${programme.totals.canonical}`}
              />
              <AdminStat
                label="Open issues"
                value={programme.totals.open_issues}
                hardFail={(programme.tiers.fail ?? 0) > 0}
              />
              <AdminStat label="Accepted gaps" value={programme.totals.accepted_dispositions} />
            </>
          )}
        </div>

        {programmeError && (
          <p className="m-0 rounded-element border border-destructive/30 bg-destructive/5 p-2 text-13 text-destructive">
            Versioned quality summary unavailable: {programmeError}
          </p>
        )}

        {programme && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-13 text-muted-foreground">
              Quality programme · rubric v{programme.rollout.rubric_version}
              <Badge variant={programme.rollout.enforcement_enabled ? 'default' : 'outline'}>
                {programme.rollout.enforcement_enabled ? 'enforced' : 'shadow mode'}
              </Badge>
            </div>
            <p className="mb-4 mt-0 text-12 text-muted-foreground">
              The rubric is {programme.rollout.enforcement_enabled ? 'enforced' : 'in shadow mode'}:
              findings are measured and reviewed
              {programme.rollout.enforcement_enabled
                ? ' and can block publication.'
                : ' without blocking publication.'}
            </p>
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {Object.entries(programme.dimensions).map(([field, value]) => (
                <CoverageBar
                  key={field}
                  label={field[0].toUpperCase() + field.slice(1)}
                  pct={Math.round(value ?? 0)}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(['pass', 'warn', 'fail'] as const).map((tier) => (
                <Badge
                  key={tier}
                  variant={
                    tier === 'fail' ? 'destructive' : tier === 'warn' ? 'default' : 'secondary'
                  }
                >
                  {tier}: {programme.tiers[tier] ?? 0}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {programme?.issues.length ? (
          <div>
            <div className="mb-2 text-13 text-muted-foreground">Largest open issue cohorts</div>
            <div className="flex flex-wrap gap-2">
              {programme.issues.slice(0, 8).map((issue) => (
                <button
                  key={issue.code}
                  type="button"
                  onClick={() => onIssueFilter?.(issue.code)}
                  className="rounded-element focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`Filter issue queue by ${issue.code}, ${issue.count} open issues`}
                >
                  <Badge variant={issue.severity === 'critical' ? 'destructive' : 'outline'}>
                    {issue.code} · {issue.count}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {coverage.length > 0 && (
          <div>
            <div className="mb-2 text-13 text-muted-foreground">Field coverage</div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              {coverage.map((c) => (
                <CoverageBar key={c.field} label={c.field} pct={c.pctComplete} />
              ))}
            </div>
          </div>
        )}

        {sourceGaps.length > 0 && (
          <div>
            <div className="mb-2 text-13 text-muted-foreground">
              Leakiest sources — fix upstream
            </div>
            <div className="flex flex-col gap-1.5">
              {sourceGaps.map((s) => (
                <div key={s.source} className="flex items-center gap-2 text-13">
                  <span className="truncate font-medium">{s.source}</span>
                  <span className="text-muted-foreground">· {s.total.toLocaleString()}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                    {s.pctMissing}% no {s.field}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {gaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <MapPin size={12} />
              Coverage gaps — thinnest cities
            </div>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g, i) => (
                <Badge
                  key={`${g.city_name ?? 'unknown'}-${i}`}
                  variant="outline"
                  className="font-normal"
                >
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

function CoverageBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-13 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-badge bg-muted">
        <div className="h-full rounded-badge bg-foreground" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-13 tabular-nums">{pct}%</span>
    </div>
  );
}
