import { useMemo, useState } from 'react';
import { FilterChip } from '@/components/transit/FilterChip';
import { eventTypeIcon } from '@/components/events/eventTypeIcon';
import { useEventTypeOptions } from '@/lib/eventTypes';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { EventDateBadge } from '@/components/transit/EventDateBadge';
import { TransitIcon } from '@/components/transit/TransitIcon';
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

function BoardRow({ row, locale }: { row: NearYouRow; locale: string }) {
  const href =
    row.kind === 'event' ? `/events/${row.slug || row.id}` : `/venues/${row.slug || row.id}`;
  return (
    <LocalizedLink
      to={href}
      className="grid min-h-[74px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2 no-underline hover:bg-surface-container focus-visible:-outline-offset-2 md:px-6"
    >
      {row.kind === 'event' && row.startDate ? (
        <EventDateBadge
          startDate={row.startDate}
          locale={locale}
          timeZone={row.timezone}
          datePrecision={row.datePrecision}
        />
      ) : (
        <span className="grid w-14 place-items-center">
          <RouteBullet type={row.kind} size={36} decorative />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-title font-bold">{row.title}</span>{' '}
        {row.via && <span className="block truncate text-13 text-muted-foreground">{row.via}</span>}
      </span>
      <TransitIcon name="arrow-right" size={20} className="rtl:rotate-180" />
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
      <WhenChips value={when} onChange={setWhen} compact className="mb-4" />
      {types.length > 1 && (
        <div
          role="group"
          aria-label={t('home.discovery.eventTypes', 'Event types')}
          className="mb-4 flex flex-wrap gap-2"
        >
          <FilterChip active={!type} onClick={() => setType(null)} label={t('search.all', 'All')} />
          {types.slice(0, 6).map((v) => {
            const Icon = eventTypeIcon(v);
            return (
              <FilterChip
                key={v}
                active={type === v}
                onClick={() => setType(type === v ? null : v)}
                label={
                  <>
                    <Icon size={16} aria-hidden />
                    {typeLabels.find((o) => o.value === v)?.label ?? v}
                  </>
                }
              />
            );
          })}
        </div>
      )}
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
            {region.cityName
              ? t('home.discovery.noCityEvents', 'No upcoming events in {{city}} yet.', {
                  city: region.cityName,
                })
              : t('home.discovery.pickCityForEvents', 'Choose a city to see its events.')}
          </p>
        ) : (
          rows.map((r) => <BoardRow key={`${r.kind}:${r.id}`} row={r} locale={i18n.language} />)
        )}
      </div>
      {isError && rows.length > 0 && (
        <HomeSectionError stale retrying={isFetching} onRetry={() => void refetch()} />
      )}
    </Band>
  );
}
