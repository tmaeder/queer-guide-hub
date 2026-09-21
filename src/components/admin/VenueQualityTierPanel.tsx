import { AlertTriangle, Layers3, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminStat } from '@/components/admin/primitives/AdminStat';
import {
  AdminSimpleTable,
  type AdminSimpleColumn,
} from '@/components/admin/primitives/AdminSimpleTable';
import { useVenueQualityDashboard } from '@/hooks/useVenueQualityDashboard';

interface DimensionRow {
  dimension: string;
  score: number | null;
}

interface SourceRow {
  source: string;
  total: number;
  promoted: number;
  average_score: number | null;
}

interface CityRow {
  city: string;
  listed: number;
  promoted: number;
}

const DIMENSION_COLUMNS: readonly AdminSimpleColumn<DimensionRow>[] = [
  { key: 'dimension', header: 'Dimension', render: (row) => row.dimension },
  {
    key: 'score',
    header: 'Average score',
    align: 'right',
    cellClassName: 'tabular-nums',
    render: (row) => (row.score == null ? '—' : `${row.score}/100`),
  },
];

const TIER_LABELS: Record<string, string> = {
  verified: 'Verified',
  guide_ready: 'Guide ready',
  listed: 'Listed',
  suppressed: 'Suppressed',
  unscored: 'Unscored',
};

const SOURCE_COLUMNS: readonly AdminSimpleColumn<SourceRow>[] = [
  { key: 'source', header: 'Source', render: (row) => row.source },
  { key: 'total', header: 'Live', align: 'right', render: (row) => row.total },
  {
    key: 'promoted',
    header: 'Guide ready',
    align: 'right',
    render: (row) => row.promoted,
  },
  {
    key: 'score',
    header: 'Avg score',
    align: 'right',
    render: (row) => row.average_score ?? '—',
  },
];

const CITY_COLUMNS: readonly AdminSimpleColumn<CityRow>[] = [
  { key: 'city', header: 'City gap', render: (row) => row.city },
  { key: 'listed', header: 'Listed', align: 'right', render: (row) => row.listed },
  {
    key: 'promoted',
    header: 'Guide ready',
    align: 'right',
    render: (row) => row.promoted,
  },
];

/** Shadow rollout health for the versioned venue quality model. */
export function VenueQualityTierPanel() {
  const { data } = useVenueQualityDashboard();
  if (!data) return null;

  const dimensionRows = Object.entries(data.average_dimensions).map(([dimension, score]) => ({
    dimension: dimension.charAt(0).toUpperCase() + dimension.slice(1),
    score,
  }));
  const snapshotCoverage = data.live_venues
    ? Math.round((data.snapshots / data.live_venues) * 100)
    : 0;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-title">
            <Layers3 size={16} />
            Venue quality tiers
          </CardTitle>
          <Badge variant={data.enforcement_enabled ? 'default' : 'secondary'}>
            {data.enforcement_enabled ? 'Enforced' : 'Shadow mode'} · v{data.score_version}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <AdminStat label={`Snapshots (${snapshotCoverage}%)`} value={data.snapshots} />
          <AdminStat
            label="Stale snapshots"
            value={data.stale_snapshots}
            hardFail={data.stale_snapshots > Math.max(1, data.live_venues * 0.01)}
          />
          <AdminStat label="Queued recomputes" value={data.pending_recompute} />
          <AdminStat
            label="Guide ready + verified"
            value={(data.tiers.guide_ready ?? 0) + (data.tiers.verified ?? 0)}
            icon={<ShieldCheck size={12} />}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {['verified', 'guide_ready', 'listed', 'suppressed', 'unscored'].map((tier) => (
            <Badge key={tier} variant="outline" className="font-normal tabular-nums">
              {TIER_LABELS[tier]} {data.tiers[tier] ?? 0}
            </Badge>
          ))}
        </div>

        <AdminSimpleTable
          caption="Average venue quality by dimension"
          columns={DIMENSION_COLUMNS}
          rows={dimensionRows}
          rowKey={(row) => row.dimension}
          emptyNoun="quality dimensions"
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <AdminSimpleTable
            caption="Largest source cohorts"
            columns={SOURCE_COLUMNS}
            rows={data.source_cohorts}
            rowKey={(row) => row.source}
            emptyNoun="source cohorts"
          />
          <AdminSimpleTable
            caption="Largest city readiness gaps"
            columns={CITY_COLUMNS}
            rows={data.city_gaps}
            rowKey={(row) => row.city}
            emptyNoun="city gaps"
          />
        </div>

        <div>
          <p className="mb-2 text-13 text-muted-foreground">Tier transitions · last 7 days</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.weekly_transitions).map(([tier, count]) => (
              <Badge key={tier} variant="outline" className="font-normal tabular-nums">
                {TIER_LABELS[tier] ?? tier.replaceAll('_', ' ')} {count}
              </Badge>
            ))}
            {Object.keys(data.weekly_transitions).length === 0 && (
              <span className="text-13 text-muted-foreground">No transitions recorded</span>
            )}
          </div>
        </div>

        {data.blockers.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <AlertTriangle size={13} /> Hard blockers
            </p>
            <div className="flex flex-wrap gap-2">
              {data.blockers.slice(0, 8).map((blocker) => (
                <Badge key={blocker.code} variant="outline" className="font-normal tabular-nums">
                  {blocker.code.replaceAll('_', ' ')} {blocker.count}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
