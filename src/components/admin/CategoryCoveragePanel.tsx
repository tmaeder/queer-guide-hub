import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tags, AlertTriangle } from 'lucide-react';
import { useCategoryCoverage } from '@/hooks/useCategoryCoverage';
import { AdminStat } from '@/components/admin/primitives/AdminStat';
import {
  AdminSimpleTable,
  type AdminSimpleColumn,
} from '@/components/admin/primitives/AdminSimpleTable';

const JOB_LABELS: Record<string, string> = {
  venue_category_reclassify: 'Venue category',
  event_type_reclassify: 'Event type',
  venue_nonvenue_flag: 'Non-venue flag',
};

interface CoverageRow {
  key: string;
  label: string;
  total: number;
  uncategorised: number;
  uncategorised_pct: number;
  /** Venues count unexamined rows; events count the mislabelled `concert` bucket. */
  unexamined: number;
}

const COVERAGE_COLUMNS: readonly AdminSimpleColumn<CoverageRow>[] = [
  { key: 'type', header: 'Type', render: (r) => r.label },
  {
    key: 'live',
    header: 'Live',
    align: 'right',
    cellClassName: 'tabular-nums',
    render: (r) => r.total.toLocaleString(),
  },
  {
    key: 'uncategorised',
    header: 'Uncategorised',
    align: 'right',
    cellClassName: 'tabular-nums',
    render: (r) => r.uncategorised.toLocaleString(),
  },
  {
    key: 'share',
    header: 'Share',
    align: 'right',
    cellClassName: 'tabular-nums',
    render: (r) => `${r.uncategorised_pct}%`,
  },
  {
    key: 'unexamined',
    header: 'Not yet examined',
    align: 'right',
    cellClassName: 'tabular-nums',
    render: (r) => r.unexamined.toLocaleString(),
  },
];

/**
 * Coverage for the two browse axes: venues.category and events.event_type.
 *
 * Categories were the only taxonomy without a health metric — tags, amenities and
 * target_groups all have one — which is why a corpus that was 62% uncategorised stayed
 * invisible until someone thought to ask.
 *
 * The `concert` bucket is counted separately from `other` on purpose: those rows are
 * actively mislabelled rather than merely unknown, so they need draining, not filling.
 */
export function CategoryCoveragePanel() {
  const { data } = useCategoryCoverage();
  if (!data) return null;

  const { venues, events, last_runs: runs } = data;
  const stalled = Object.entries(runs ?? {}).filter(([, r]) => !r.enabled || r.status === 'failed');

  const coverageRows: CoverageRow[] = [
    {
      key: 'venues',
      label: 'Venues',
      total: venues.total,
      uncategorised: venues.uncategorised,
      uncategorised_pct: venues.uncategorised_pct ?? 0,
      unexamined: venues.unexamined,
    },
    {
      key: 'events',
      label: 'Events',
      total: events.total,
      uncategorised: events.uncategorised,
      uncategorised_pct: events.uncategorised_pct ?? 0,
      unexamined: events.unexamined_concert,
    },
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Tags size={16} />
          Category coverage
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AdminSimpleTable
          caption="Category coverage by entity"
          columns={COVERAGE_COLUMNS}
          rows={coverageRows}
          rowKey={(r) => r.key}
          emptyNoun="entity types"
        />

        <div className="flex flex-wrap gap-2">
          <AdminStat label="Venue categories auto-applied" value={venues.auto_applied} />
          <AdminStat label="Venues awaiting review" value={venues.awaiting_review} />
          <AdminStat label="No signal (stays 'other')" value={venues.no_signal} />
          <AdminStat label="Probable non-venues" value={venues.nonvenue_candidates} />
          <AdminStat label="Events reclassified" value={events.reclassified} />
          <AdminStat
            label="Mislabelled 'concert' left"
            value={events.concert_bucket_remaining}
            hardFail={events.concert_bucket_remaining > 0}
          />
        </div>

        {stalled.length > 0 && (
          <p className="flex items-start gap-1.5 text-13 text-muted-foreground">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Backfill job not running: {stalled.map(([k]) => JOB_LABELS[k] ?? k).join(', ')}. The
            venue engine sat unscheduled for its entire existence, so an unregistered or failing job
            here is the failure mode to watch.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
