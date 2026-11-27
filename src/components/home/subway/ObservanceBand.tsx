import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Band } from '@/components/home/Band';
import { useHomeCity } from '@/components/home/useHomeCity';
import { BoardRows, BoardRowsSkeleton } from '@/components/home/subway/BoardRows';
import { useObservancesIndex } from '@/hooks/useObservanceIndex';
import { useObservance, useObservanceEvents } from '@/hooks/useObservances';
import type { NearYouRow } from '@/hooks/useHomeNearYou';
import { nextObservanceWithin } from '@/lib/observanceView';
import { eventWindow } from '@/lib/observanceWindow';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';

const ROWS = 4;

/**
 * Homepage section for the next awareness day within 14 days, shown only when
 * events are linked to it. Events in the visitor's city come first, then the
 * soonest. States the date only, no countdown: memorial days share this slot.
 */
export function ObservanceBand() {
  const { t, i18n } = useTranslation();
  const region = useHomeCity();
  const { data: index = [] } = useObservancesIndex();
  const today = new Date().toISOString().slice(0, 10);
  const next = nextObservanceWithin(index, today);
  const shown = next && next.linked_count > 0 ? next : null;
  const { data: obs } = useObservance(shown?.slug);
  const win = useMemo(
    () =>
      shown && obs ? eventWindow(shown.dates, obs.window_days_before, obs.window_days_after) : null,
    [shown, obs],
  );
  const { data: events = [], isLoading } = useObservanceEvents(obs?.id, win);

  const rows = useMemo<NearYouRow[]>(() => {
    const city = region.cityName?.toLowerCase();
    const upcoming = events.filter((e) => (e.start_date ?? '') >= today);
    const pool = upcoming.length > 0 ? upcoming : events;
    return [...pool]
      .sort(
        (a, b) =>
          Number((b.city ?? '').toLowerCase() === city) -
            Number((a.city ?? '').toLowerCase() === city) ||
          (a.start_date ?? '').localeCompare(b.start_date ?? ''),
      )
      .slice(0, ROWS)
      .map((e) => ({
        id: e.id,
        kind: 'event',
        title: e.title,
        slug: e.slug,
        startDate: e.start_date,
        timezone: e.timezone,
        datePrecision:
          (e.enrichment_status as { date_confirmation?: { precision?: string } } | null)
            ?.date_confirmation?.precision ?? null,
        eventType: e.event_type,
        via: [e.venue_name, e.city].filter(Boolean).join(' · '),
        image: resolveEntityImage('event', e).url,
        rung: 'local',
      }));
  }, [events, region.cityName, today]);

  if (!shown) return null;
  if (!isLoading && obs && rows.length === 0) return null;

  const date = new Date(`${shown.starts}T12:00:00Z`).toLocaleDateString(i18n.language || 'en', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return (
    <Band
      title={shown.name}
      eyebrow={date}
      description={shown.summary}
      seeAllHref={`/days/${shown.slug}`}
      seeAllLabel={t('observances.home.allEvents', 'All {{count}} events', {
        count: shown.linked_count,
      })}
    >
      {rows.length === 0 ? <BoardRowsSkeleton /> : <BoardRows rows={rows} locale={i18n.language} />}
    </Band>
  );
}
