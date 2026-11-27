import { useMemo, useState } from 'react';
import { FilterChip } from '@/components/transit/FilterChip';
import { eventTypeIcon } from '@/components/events/eventTypeIcon';
import { useEventTypeOptions } from '@/lib/eventTypes';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { EventDateBadge } from '@/components/transit/EventDateBadge';
import { Image } from '@/components/ui/Image';
import { Band } from '@/components/home/Band';
import { RegionChip } from '@/components/home/RegionChip';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { useHomeCity } from '@/components/home/useHomeCity';
import { useHomeNearYou, type NearYouRow } from '@/hooks/useHomeNearYou';
import { NextObservanceLine } from '@/components/observances/NextObservanceLine';
import { WhenChips } from '@/components/intent/WhenChips';
import { useWhen, whenRange } from '@/lib/whenSelection';

const ROWS = 4;
/** Fetched window, so a type filter still has rows to show. */
const POOL = 24;

/** Phones: a compact row — photo thumbnail with the date on it, then title and where. */
function BoardListRow({ row, locale }: { row: NearYouRow; locale: string }) {
  const href =
    row.kind === 'event' ? `/events/${row.slug || row.id}` : `/venues/${row.slug || row.id}`;
  return (
    <LocalizedLink
      to={href}
      className="flex items-center gap-4 p-2 pe-4 no-underline hover:bg-surface-container focus-visible:-outline-offset-2"
    >
      <span className="relative w-24 shrink-0 overflow-hidden rounded-element">
        <Image
          src={row.image ?? null}
          alt=""
          aspect="square"
          imageRole="thumb"
          rounded="none"
          fallbackEntityType={row.kind}
          fallbackIcon={row.eventType ? eventTypeIcon(row.eventType) : undefined}
          fallbackKey={row.id}
          sizes="96px"
        />
        {row.kind === 'event' && row.startDate && (
          <span className="absolute bottom-1 start-1 origin-bottom-left scale-75">
            <EventDateBadge
              startDate={row.startDate}
              locale={locale}
              timeZone={row.timezone}
              datePrecision={row.datePrecision}
            />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-15 font-bold leading-snug">{row.title}</span>
        {/* The space keeps the link name "Title Place", not "TitlePlace". */}
        {row.via && ' '}
        {row.via && <span className="truncate text-13 text-muted-foreground">{row.via}</span>}
      </span>
    </LocalizedLink>
  );
}

/**
 * One listing as a gallery card: the cover photo (or the type's fallback art)
 * with the date pinned on it, then the title and where. Tablets get a 2×2
 * grid, desktop one row of four.
 */
function BoardCard({ row, locale }: { row: NearYouRow; locale: string }) {
  const href =
    row.kind === 'event' ? `/events/${row.slug || row.id}` : `/venues/${row.slug || row.id}`;
  return (
    <LocalizedLink
      to={href}
      className="group flex h-full flex-col overflow-hidden rounded-container bg-card no-underline shadow-soft transition-shadow hover:shadow-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div className="relative">
        <Image
          src={row.image ?? null}
          alt=""
          aspect="card"
          imageRole="cover"
          rounded="none"
          fallbackEntityType={row.kind}
          fallbackIcon={row.eventType ? eventTypeIcon(row.eventType) : undefined}
          fallbackKey={row.id}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 80vw"
        />
        <span className="absolute start-2 top-2">
          {row.kind === 'event' && row.startDate ? (
            <EventDateBadge
              startDate={row.startDate}
              locale={locale}
              timeZone={row.timezone}
              datePrecision={row.datePrecision}
            />
          ) : (
            <RouteBullet type={row.kind} size={36} decorative />
          )}
        </span>
      </div>
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <span className="line-clamp-2 text-15 font-bold leading-snug">{row.title}</span>
        {/* The space keeps the link name "Title Place", not "TitlePlace". */}
        {row.via && ' '}
        {row.via && <span className="truncate text-13 text-muted-foreground">{row.via}</span>}
      </span>
    </LocalizedLink>
  );
}

/** Regional listings name their actual scope and group worldwide additions separately. */
export function DeparturesBoard({ showRegionPicker = false }: { showRegionPicker?: boolean }) {
  const { t, i18n } = useTranslation();
  // Same city as the hero above: the visitor's own, else the featured fallback.
  const region = useHomeCity();
  const [when, setWhen] = useWhen();
  const range = useMemo(() => (when ? whenRange(when) : null), [when]);
  const { data, isLoading, isError, isFetching, refetch } = useHomeNearYou(region, POOL, range);

  const loading = region.loading || isLoading;
  const all = data?.rows ?? [];
  const [type, setType] = useState<string | null>(null);
  const typeLabels = useEventTypeOptions();
  const typeLabel = (v: string) => typeLabels.find((o) => o.value === v)?.label ?? v;
  // Only types actually on the board, most frequent first.
  const types = [
    ...all.reduce(
      (m, r) => (r.eventType ? m.set(r.eventType, (m.get(r.eventType) ?? 0) + 1) : m),
      new Map<string, number>(),
    ),
  ]
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v);
  const rows = (type ? all.filter((r) => r.eventType === type) : all).slice(0, ROWS);
  const scope = region.cityName ?? null;

  return (
    <Band
      surface="tint"
      title={t('home.discovery.cityEvents', 'Events')}
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
      <NextObservanceLine />
      {/* When and what in one row that scrolls sideways: every choice is visible
          and one tap, no dropdowns. Tapping the active chip clears it. */}
      <div className="-mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 [&::-webkit-scrollbar]:hidden">
        <WhenChips value={when} onChange={setWhen} className="flex shrink-0 gap-2" />
        {types.length > 1 && (
          <>
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
            <div
              role="group"
              aria-label={t('home.discovery.eventTypes', 'Event types')}
              className="flex shrink-0 gap-2"
            >
              {types.slice(0, 8).map((v) => {
                const Icon = eventTypeIcon(v);
                return (
                  <FilterChip
                    key={v}
                    active={type === v}
                    onClick={() => setType(type === v ? null : v)}
                    label={
                      <>
                        <Icon size={16} aria-hidden />
                        <span className="whitespace-nowrap">{typeLabel(v)}</span>
                      </>
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
      {loading ? (
        // Skeletons at the real shapes, so nothing jumps on load.
        <div aria-busy>
          <div className="divide-y divide-border overflow-hidden rounded-container bg-card sm:hidden">
            {Array.from({ length: ROWS }).map((_, i) => (
              <div key={i} aria-hidden="true" className="flex items-center gap-4 p-2">
                <div className="size-24 rounded-element bg-muted motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
          <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: ROWS }).map((_, i) => (
              <div key={i} aria-hidden="true" className="overflow-hidden rounded-container bg-card">
                <div className="aspect-[16/10] bg-muted motion-safe:animate-pulse" />
                <div className="h-[76px]" />
              </div>
            ))}
          </div>
        </div>
      ) : isError && rows.length === 0 ? (
        <HomeSectionError retrying={isFetching} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <p className="rounded-container bg-card px-4 py-8 text-15 text-muted-foreground md:px-6">
          {region.cityName
            ? t('home.discovery.noCityEvents', 'No upcoming events in {{city}} yet.', {
                city: region.cityName,
              })
            : t('home.discovery.pickCityForEvents', 'Choose a city to see its events.')}
        </p>
      ) : (
        <>
          {/* Phones: one compact list, all four visible without swiping. */}
          <div
            data-layout="list"
            className="divide-y divide-border overflow-hidden rounded-container bg-card sm:hidden"
          >
            {rows.map((r) => (
              <BoardListRow key={`${r.kind}:${r.id}`} row={r} locale={i18n.language} />
            ))}
          </div>
          {/* Tablet and up: a photo gallery, 2×2 then one row of four. */}
          <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            {rows.map((r) => (
              <BoardCard key={`${r.kind}:${r.id}`} row={r} locale={i18n.language} />
            ))}
          </div>
        </>
      )}
      {isError && rows.length > 0 && (
        <HomeSectionError stale retrying={isFetching} onRetry={() => void refetch()} />
      )}
    </Band>
  );
}
