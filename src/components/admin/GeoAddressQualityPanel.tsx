import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPinned, AlertTriangle, Globe2 } from 'lucide-react';
import { useGeoAddressGaps } from '@/hooks/useGeoAddressGaps';
import { useGeoHygiene } from '@/hooks/useGeoHygiene';
import { AdminStat } from '@/components/admin/primitives/AdminStat';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

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
/** "2 h ago" / "3 d ago". Null means the sweep has never run at all. */
function ageLabel(hours: number | null | undefined) {
  if (hours === null || hours === undefined) return 'never run';
  if (hours < 1) return 'just now';
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function GeoAddressQualityPanel() {
  const { data } = useGeoAddressGaps();
  const { data: geo, isError: geoUnavailable } = useGeoHygiene();
  if (!data) return null;

  const { queue, cities } = data;
  const parked = queue?.parked ?? 0;

  // Zero polygons means the containment numbers measure nothing. Rendering them
  // as "0 problems" would be the single most misleading thing this panel could
  // do, so an unloaded authority gets its own message instead.
  const authorityEmpty = !!geo && (geo.boundary_rows === 0 || geo.boundary_cells === 0);
  const mismatch = geo
    ? Object.entries(geo.containment)
        .filter(([k]) => k.startsWith('country_mismatch:'))
        .reduce((a, [, n]) => a + n, 0)
    : 0;
  const offshore = geo
    ? Object.entries(geo.containment)
        .filter(([k]) => k.startsWith('offshore:'))
        .reduce((a, [, n]) => a + n, 0)
    : 0;

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
                    <td className="py-2 text-right tabular-nums">
                      {row.missing_country_id.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.missing_state.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.missing_postal.toLocaleString()}
                    </td>
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

        {/* Coordinate correctness. Distinct from the completeness table above:
            that asks what is missing, this asks what contradicts itself. */}
        <div className="border-t border-border pt-4">
          <h3 className="mb-2 flex items-center gap-2 text-2xs uppercase tracking-wide text-muted-foreground">
            <Globe2 size={13} />
            Coordinate correctness
          </h3>

          {geoUnavailable && (
            <p className="text-13 text-muted-foreground">
              Not available on this environment — <code>geo_hygiene_stats</code> has not been
              deployed. This is a missing check, not a clean result.
            </p>
          )}

          {authorityEmpty && (
            <p className="flex items-start gap-1.5 text-13 text-muted-foreground">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              No boundary geometry is loaded, so every figure below would read as zero regardless of
              the data. Run
              <code className="mx-1">scripts/data-quality/load-geo-boundaries.mjs</code>
              then <code className="mx-1">refresh_geo_boundary_cells()</code>.
            </p>
          )}

          {geo && !authorityEmpty && (
            <>
              <div className="flex flex-wrap gap-2">
                <AdminStat
                  label="Coordinate in the wrong country"
                  value={mismatch}
                  hardFail={mismatch > 0}
                />
                <AdminStat label="Offshore (>5km from land)" value={offshore} />
                <AdminStat
                  label="Cities with a bad centroid + content"
                  value={geo.city_coord_defects_with_content}
                  hardFail={geo.city_coord_defects_with_content > 0}
                />
                <AdminStat label="Checked against" value={`${geo.boundary_iso_codes} countries`} />
                <AdminStat label="Last swept" value={ageLabel(geo.findings_age_hours)} />
              </div>

              {geo.city_coord_defects_with_content > 0 && (
                <p className="mt-2 text-13 text-muted-foreground">
                  A wrong city centroid propagates to every venue and event linked to it, and
                  distance-to-city detectors cannot see it because they measure against that same
                  centroid. Fix the city first.
                </p>
              )}

              <p className="mt-2 text-13 text-muted-foreground">
                Parent/child geographies count as agreeing, so a Réunion venue resolving to France
                is not a finding.{' '}
                <LocalizedLink to="/admin/geography" className="underline">
                  Geography integrity
                </LocalizedLink>{' '}
                covers the relational side (a row whose city and country disagree).
              </p>
            </>
          )}
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
