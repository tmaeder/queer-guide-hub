import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useCitiesByIds } from '@/hooks/useCitiesByIds';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * Destination rail driven by recommendation-engine output. Surfaces the top
 * personalized cities with up to two reason chips per card ("Because you
 * favorited Berlin", "Pride season"). Renders nothing when there's no signal —
 * caller is expected to either fall back to a different rail or omit the
 * section entirely (clean empty state at the page level).
 */
export function BecauseYouRail({ limit = 8 }: { limit?: number }) {
  const { t } = useTranslation();
  const { data: recs, isLoading } = useRecommendations({ recType: 'destination', limit });
  const cityIds = useMemo(
    () =>
      (recs || [])
        .filter((r) => r.entity_type === 'city' && r.entity_id)
        .map((r) => r.entity_id),
    [recs],
  );

  const { data: cities } = useCitiesByIds(cityIds);

  if (isLoading) return <RailSkeleton />;
  if (!recs || recs.length === 0 || cityIds.length === 0) return null;

  const cityMap = new Map((cities || []).map((c) => [c.id, c]));

  return (
    <section aria-labelledby="because-you-rail-heading" className="mb-12">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
            {t('travel.becauseYou.kicker', 'Picked for you')}
          </p>
          <h2 id="because-you-rail-heading" className="text-headline font-bold tracking-tight">
            {t('travel.becauseYou.heading', 'Where to next')}
          </h2>
        </div>
      </header>

      <ScrollArea className="-mx-4 px-4">
        <ul className="flex gap-4 pb-4">
          {recs.map((rec) => {
            if (rec.entity_type !== 'city' || !rec.entity_id) return null;
            const city = cityMap.get(rec.entity_id);
            if (!city) return null;
            const reasons = extractReasons(rec, 2);
            const flag = (city.countries as { flag_emoji?: string } | null)?.flag_emoji;
            const country = (city.countries as { name?: string } | null)?.name;
            return (
              <li
                key={rec.id}
                className="w-72 shrink-0 snap-start"
                aria-label={`${city.name} — ${reasons[0] ?? ''}`}
              >
                <LocalizedLink
                  to={`/city/${city.slug || city.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-container border bg-background no-underline transition-opacity hover:opacity-90"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                    {city.image_url ? (
                      <img
                        src={city.image_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    ) : null}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <h3 className="truncate text-title font-bold leading-tight text-foreground">
                      {flag ? <span aria-hidden>{flag} </span> : null}
                      {city.name}
                    </h3>
                    {country ? (
                      <p className="truncate text-13 text-muted-foreground">{country}</p>
                    ) : null}
                    {reasons.length > 0 ? (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {reasons.map((reason) => (
                          <li
                            key={reason}
                            className={cn(
                              'inline-flex items-center rounded-badge border bg-muted px-2 py-0.5 text-2xs uppercase tracking-[0.1em] text-muted-foreground',
                            )}
                          >
                            {reason}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </LocalizedLink>
              </li>
            );
          })}
          <li className="flex w-72 shrink-0 items-center justify-center">
            <LocalizedLink
              to="/cities"
              className="inline-flex items-center gap-2 text-13 font-medium text-muted-foreground hover:text-foreground"
            >
              {t('travel.becauseYou.seeAll', 'Browse all cities')}
              <ArrowRight size={14} />
            </LocalizedLink>
          </li>
        </ul>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}

function RailSkeleton() {
  return (
    <section aria-hidden className="mb-12">
      <div className="mb-4 h-6 w-40 bg-muted" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={280} className="w-72 shrink-0 rounded-container" />
        ))}
      </div>
    </section>
  );
}

function extractReasons(
  rec: { reason: string | null; metadata: Record<string, unknown> },
  max: number,
): string[] {
  const fromMetadata = Array.isArray(rec.metadata?.reasons)
    ? (rec.metadata.reasons as string[])
    : [];
  const all = (fromMetadata.length > 0 ? fromMetadata : rec.reason ? [rec.reason] : []).filter(
    Boolean,
  );
  return all.slice(0, max).map(humanizeReason);
}

function humanizeReason(reason: string): string {
  // reasons emitted as `favorited:Berlin`, `country_favorited:Italy`,
  // `pride_proximity`, `social_graph`, `in_season`, `trip_destination`,
  // `same_country`, `below_safety_threshold`, ...
  if (reason.startsWith('favorited:')) {
    const name = reason.slice('favorited:'.length);
    return `Because you favorited ${name}`;
  }
  if (reason.startsWith('country_favorited:')) {
    const name = reason.slice('country_favorited:'.length);
    return `In a country you love (${name})`;
  }
  switch (reason) {
    case 'pride_proximity':
      return 'Pride season';
    case 'social_graph':
      return 'Friends saved this';
    case 'in_season':
      return 'In season';
    case 'trip_destination':
      return 'On a trip you started';
    case 'same_country':
      return 'Same country as a favorite';
    case 'page_view':
      return 'You viewed this';
    case 'search':
      return 'You searched for this';
    case 'booking_click':
      return 'You looked at booking';
    case 'below_safety_threshold':
      return 'Below your safety threshold';
    default:
      return reason.replace(/_/g, ' ');
  }
}
