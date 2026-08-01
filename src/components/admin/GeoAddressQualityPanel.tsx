import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPinned, AlertTriangle } from 'lucide-react';
import { useGeoAddressGaps } from '@/hooks/useGeoAddressGaps';
import { AdminStat } from '@/components/admin/primitives/AdminStat';

const ENTITY_ROWS = [
  { key: 'venues', label: 'Venues' },
  { key: 'events', label: 'Events' },
  { key: 'hotels', label: 'Hotels' },
  { key: 'organizations', label: 'Businesses' },
] as const;

/**
 * Address completeness: how many live rows still lack country_id / state /
 * postal_code, plus the health of the geocoding queue that fills postal codes.
 *
 * `cities.region_name` gets its own line because it is the upstream source of
 * `state` for every other type — a gap there is a gap on thousands of venues.
 */
export function GeoAddressQualityPanel() {
  const { data } = useGeoAddressGaps();
  if (!data) return null;

  const { queue, cities } = data;
  const parked = queue?.parked ?? 0;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <MapPinned size={16} />
          Address completeness
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 text-left font-normal">Type</th>
                <th className="py-2 text-right font-normal">Live</th>
                <th className="py-2 text-right font-normal">No country</th>
                <th className="py-2 text-right font-normal">No state</th>
                <th className="py-2 text-right font-normal">No postal</th>
              </tr>
            </thead>
            <tbody>
              {ENTITY_ROWS.map(({ key, label }) => {
                const row = data[key];
                if (!row) return null;
                return (
                  <tr key={key} className="border-t border-border">
                    <td className="py-2">{label}</td>
                    <td className="py-2 text-right tabular-nums">{row.live.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{row.missing_country_id.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{row.missing_state.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{row.missing_postal.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* cities.region_name is the upstream source of `state` for every
              venue, event and hotel — a gap here is a gap on thousands of rows. */}
          <AdminStat label="Cities without a region" value={cities?.geocodable_gap ?? 0} />
          <AdminStat label="Postal queue" value={queue?.depth ?? 0} />
          <AdminStat label="Parked (4 failed attempts)" value={parked} hardFail={parked > 0} />
        </div>

        {parked > 0 && (
          <p className="flex items-start gap-1.5 text-13 text-muted-foreground">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Parked rows stopped retrying after 4 failures. Inspect
            <code className="mx-1">geo_address_queue.last_error</code> before requeueing.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
