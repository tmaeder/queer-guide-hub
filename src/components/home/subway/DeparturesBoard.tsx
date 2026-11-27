import { useMemo, useState } from 'react';
import { FilterChip } from '@/components/transit/FilterChip';
import { eventTypeIcon } from '@/components/events/eventTypeIcon';
import { useEventTypeOptions } from '@/lib/eventTypes';
import { useTranslation } from 'react-i18next';
import { Band } from '@/components/home/Band';
import { RegionChip } from '@/components/home/RegionChip';
import { HomeSectionError } from '@/components/home/HomeSectionError';
import { useHomeCity } from '@/components/home/useHomeCity';
import { useHomeNearYou } from '@/hooks/useHomeNearYou';
import { BoardRows, BoardRowsSkeleton } from '@/components/home/subway/BoardRows';
import { WhenChips } from '@/components/intent/WhenChips';
import { useWhen, whenRange } from '@/lib/whenSelection';

const ROWS = 4;
/** Fetched window, so a type filter still has rows to show. */
const POOL = 24;

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
        <BoardRowsSkeleton />
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
        <BoardRows rows={rows} locale={i18n.language} />
      )}
      {isError && rows.length > 0 && (
        <HomeSectionError stale retrying={isFetching} onRetry={() => void refetch()} />
      )}
    </Band>
  );
}
