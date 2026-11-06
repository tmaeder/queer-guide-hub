import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Band } from '@/components/home/Band';
import { RegionChip } from '@/components/home/RegionChip';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { useHomeRegionContext } from '@/components/home/homeRegionContext';
import { useHomeNearYou, type NearYouRow } from '@/hooks/useHomeNearYou';

const ROWS = 4;

const formatBoardTime = (iso: string | null, locale: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = d.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  // All-day rows (midnight timestamps) read as a date, not a fake 00:00.
  const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return time === '00:00' ? `${day} ${date}` : `${day} ${time}`;
};

function BoardRow({ row, locale }: { row: NearYouRow; locale: string }) {
  const href =
    row.kind === 'event' ? `/events/${row.slug || row.id}` : `/venues/${row.slug || row.id}`;
  const date =
    row.kind === 'event' && row.startDate ? formatBoardTime(row.startDate, locale) : null;

  return (
    <LocalizedLink
      to={href}
      className="grid min-h-[74px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 no-underline hover:bg-surface-container focus-visible:-outline-offset-2 md:px-6"
    >
      <RouteBullet type={row.kind} size={36} decorative />
      <span className="min-w-0">
        <span className="block truncate text-title font-bold">{row.title}</span>{' '}
        <span className="block truncate text-13 text-muted-foreground">
          {[date, row.via].filter(Boolean).join(' · ')}
        </span>
      </span>
      <TransitIcon name="arrow-right" size={20} className="rtl:rotate-180" />
    </LocalizedLink>
  );
}

/** Regional listings name their actual scope and group worldwide additions separately. */
export function DeparturesBoard({ showRegionPicker = true }: { showRegionPicker?: boolean }) {
  const { t, i18n } = useTranslation();
  const region = useHomeRegionContext();
  const { data, isLoading, isError, isFetching, refetch } = useHomeNearYou(region, ROWS);

  const loading = region.loading || isLoading;
  const rows = data?.rows ?? [];
  const local = rows.filter((r) => r.rung === 'local');
  const trip = rows.filter((r) => r.rung === 'trip');

  const country =
    data?.scope === 'country' &&
    typeof Intl.DisplayNames === 'function' &&
    region.countryCode &&
    /^[a-z]{2}$/i.test(region.countryCode)
      ? new Intl.DisplayNames(i18n.resolvedLanguage ?? i18n.language, {
          type: 'region',
          fallback: 'none',
        }).of(region.countryCode.toUpperCase())
      : undefined;
  const area = data?.scope === 'city' ? region.cityName : country || region.countryName;
  const scope =
    data?.scope === 'network' ? t('home.discovery.listingsGlobal', 'Worldwide') : data && area;

  return (
    <Band
      surface="tint"
      title={t('home.discovery.listings', 'Places and events')}
      description={
        <span className="relative block min-h-6">
          <span className="absolute inset-x-0 truncate" title={scope ?? undefined}>
            {scope}
          </span>
        </span>
      }
      seeAllHref="/events"
      seeAllLabel={t('home.discovery.allEvents', 'See all events')}
      action={showRegionPicker ? <RegionChip region={region} /> : undefined}
    >
      <div className="overflow-hidden rounded-container bg-card" aria-busy={loading}>
        {loading ? (
          // Skeletons at the loaded row's real height (a two-line title/via
          // stack at py-4), not a flat h-16 that is shorter than the content
          // it stands in for — that difference is a homepage CLS source.
          Array.from({ length: ROWS }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-[74px] motion-safe:animate-pulse border-b border-border last:border-b-0"
            />
          ))
        ) : isError && rows.length === 0 ? (
          <HomeSectionError
            className="shadow-none"
            retrying={isFetching}
            onRetry={() => void refetch()}
          />
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-15 text-muted-foreground md:px-6">
            {t('home.discovery.noListings', 'No listings found for this area.')}
          </p>
        ) : (
          <>
            {local.map((r) => (
              <BoardRow key={`${r.kind}:${r.id}`} row={r} locale={i18n.language} />
            ))}
            {trip.length > 0 && (
              <>
                {local.length > 0 && (
                  <div className="border-t border-border px-4 py-2 md:px-6">
                    <Eyebrow as="div">
                      {t('home.discovery.otherEvents', 'Events elsewhere')}
                    </Eyebrow>
                  </div>
                )}
                {trip.map((r) => (
                  <BoardRow key={`${r.kind}:${r.id}`} row={r} locale={i18n.language} />
                ))}
              </>
            )}
          </>
        )}
      </div>
      {isError && rows.length > 0 && (
        <HomeSectionError stale retrying={isFetching} onRetry={() => void refetch()} />
      )}
    </Band>
  );
}
