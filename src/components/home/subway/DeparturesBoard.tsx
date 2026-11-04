import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
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
  return (
    <div className="group relative border-b border-border-hairline last:border-b-0">
      <div className="grid grid-cols-[42px_1fr_auto] items-center gap-4 px-4 py-4 transition-colors group-hover:bg-surface-container md:grid-cols-[52px_120px_1fr_28px] md:px-6">
        <RouteBullet type={row.kind} size={42} />
        {/* Blank, not an em-dash. A standing place has no departure time, and a
            column of "—" down five of six rows reads as missing data rather
            than as an attribute that does not apply. The cell keeps its width
            so the titles stay on one vertical. */}
        <span className="hidden text-body-lg font-bold tabular-nums md:block">
          {row.kind === 'event' ? formatBoardTime(row.startDate, locale) : ''}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-title font-bold md:text-headline">{row.title}</span>
          <span className="mt-0.5 block truncate text-13 text-muted-foreground">
            {row.kind === 'event' && (
              <span className="md:hidden">{formatBoardTime(row.startDate, locale)} · </span>
            )}
            {row.via}
          </span>
        </span>
        <span className="hidden text-xl font-bold md:block" aria-hidden>
          →
        </span>
      </div>
      <LocalizedLink to={href} className="absolute inset-0 no-underline" aria-label={row.title} />
    </div>
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

  const area = data?.scope === 'city' ? region.cityName : region.countryName || region.countryCode;
  const title =
    data?.scope === 'network'
      ? t('home.discovery.listingsGlobal', 'Places and events worldwide')
      : area && data
        ? t('home.discovery.listingsArea', 'Places and events in {{city}}', { city: area })
        : t('home.discovery.listings', 'Places and events');

  return (
    <Band
      surface="tint"
      title={title}
      seeAllHref="/events"
      seeAllLabel={t('home.discovery.allEvents', 'See all events')}
      action={showRegionPicker ? <RegionChip region={region} /> : undefined}
    >
      <div className="bg-card rounded-container shadow-soft" aria-busy={loading}>
        {loading ? (
          // Skeletons at the loaded row's real height (a two-line title/via
          // stack at py-4), not a flat h-16 that is shorter than the content
          // it stands in for — that difference is a homepage CLS source.
          Array.from({ length: ROWS }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-[74px] motion-safe:animate-pulse border-b border-border-hairline last:border-b-0"
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
                  <div className="border-t border-border-hairline px-4 py-2 md:px-6">
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
