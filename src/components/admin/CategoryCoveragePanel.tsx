import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tags, AlertTriangle } from 'lucide-react';
import { useCategoryCoverage } from '@/hooks/useCategoryCoverage';
import { AdminStat } from '@/components/admin/primitives/AdminStat';

const JOB_LABELS: Record<string, string> = {
  venue_category_reclassify: 'Venue category',
  event_type_reclassify: 'Event type',
  venue_nonvenue_flag: 'Non-venue flag',
};

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

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Tags size={16} />
          Category coverage
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-normal">Type</th>
                <th className="py-2 text-right font-normal">Live</th>
                <th className="py-2 text-right font-normal">Uncategorised</th>
                <th className="py-2 text-right font-normal">Share</th>
                <th className="py-2 text-right font-normal">Not yet examined</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="py-2">Venues</td>
                <td className="py-2 text-right tabular-nums">{venues.total.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums">
                  {venues.uncategorised.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums">{venues.uncategorised_pct ?? 0}%</td>
                <td className="py-2 text-right tabular-nums">
                  {venues.unexamined.toLocaleString()}
                </td>
              </tr>
              <tr className="border-t border-border">
                <td className="py-2">Events</td>
                <td className="py-2 text-right tabular-nums">{events.total.toLocaleString()}</td>
                <td className="py-2 text-right tabular-nums">
                  {events.uncategorised.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums">{events.uncategorised_pct ?? 0}%</td>
                <td className="py-2 text-right tabular-nums">
                  {events.unexamined_concert.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

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
