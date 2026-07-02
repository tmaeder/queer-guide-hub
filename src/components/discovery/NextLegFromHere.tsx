import { useTranslation } from 'react-i18next';
import { Plane } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { detailHref } from '@/lib/searchRoutes';
import { Skeleton } from '@/components/ui/skeleton';
import { useNearbyCities, type NearbyCity } from '@/hooks/useNearbyCities';

interface Props {
  cityId: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

/**
 * "Next leg from here" — three flight-time columns built from great-circle
 * distance. Schema-safe: just lat/long on cities. Renders nothing without
 * an origin geo so editorial sections collapse cleanly when the city has
 * no coordinates.
 */
export function NextLegFromHere({ cityId, latitude, longitude }: Props) {
  const { t } = useTranslation();
  const origin =
    latitude != null && longitude != null
      ? { cityId, latitude: Number(latitude), longitude: Number(longitude) }
      : null;
  const { data, isLoading } = useNearbyCities({ origin, limit: 9 });

  if (!origin) return null;
  if (isLoading) return <Skeleton />;
  if (!data || data.length === 0) return null;

  const groups: Array<{
    bucket: NearbyCity['bucket'];
    label: string;
    rows: NearbyCity[];
  }> = [
    { bucket: 'short', label: t('discovery.nextLeg.short', '< 2h flight'), rows: data.filter((c) => c.bucket === 'short') },
    { bucket: 'medium', label: t('discovery.nextLeg.medium', '2–5h flight'), rows: data.filter((c) => c.bucket === 'medium') },
    { bucket: 'long', label: t('discovery.nextLeg.long', '5h+ flight'), rows: data.filter((c) => c.bucket === 'long') },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {groups.map((group) => (
        <div key={group.bucket} className="flex flex-col gap-4">
          <h4 className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">
            {group.label}
          </h4>
          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => {
              // Strict: require a canonical slug — skip a city with only an id.
              const to = detailHref({ type: 'city', slug: row.slug, id: row.id });
              if (!to) return null;
              return (
              <li key={row.id}>
                <LocalizedLink
                  to={to}
                  className="flex items-center justify-between gap-2 rounded-element border px-4 py-2 no-underline transition-colors hover:border-foreground/40"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    {row.countries?.flag_emoji ? (
                      <span aria-hidden className="shrink-0 text-13">
                        {row.countries.flag_emoji}
                      </span>
                    ) : null}
                    <span className="truncate text-13 font-semibold text-foreground">
                      {row.name}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-2xs uppercase tracking-[0.1em] text-muted-foreground tabular-nums">
                    <Plane size={12} aria-hidden />
                    {Math.round(row.distance_km).toLocaleString()} km
                  </span>
                </LocalizedLink>
              </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
