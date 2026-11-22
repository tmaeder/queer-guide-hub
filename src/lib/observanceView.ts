import type { EntityMapMarker } from '@/components/map/EntityMap';
import type { ObservanceIndexRow } from '@/hooks/useObservanceIndex';
import type { ObservanceDateRow } from '@/lib/observanceWindow';

/** Pure helpers for the observance surfaces, kept out of component files for Fast Refresh. */

const WINDOW_DAYS = 60;

/** Pure: observances starting within WINDOW_DAYS of `today`, plus the selected one. */
export function facetOptions(
  rows: ObservanceIndexRow[],
  selected: string,
  today: string,
): ObservanceIndexRow[] {
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return rows.filter((r) => r.slug === selected || (r.starts >= today && r.starts <= limit));
}

/** Pure: the soonest observance whose occurrence starts within `days` of `today` (or has started). */
export function nextObservanceWithin(
  rows: ObservanceIndexRow[],
  today: string,
  days = 14,
): ObservanceIndexRow | null {
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  // observances_index returns the current occurrence until its after-window closes,
  // so an observance that started yesterday is still `starts <= limit`.
  return (
    rows.filter((r) => r.starts <= limit).sort((a, b) => a.starts.localeCompare(b.starts))[0] ??
    null
  );
}

export interface MappableEvent {
  id: string;
  title: string;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  start_date: string | null;
}

/** Pure: events with coordinates as map markers. */
export function observanceMarkers(events: MappableEvent[]): EntityMapMarker[] {
  return events
    .filter(
      (e) =>
        e.latitude !== null &&
        e.longitude !== null &&
        Number.isFinite(Number(e.latitude)) &&
        Number.isFinite(Number(e.longitude)),
    )
    .map((e) => ({
      id: e.id,
      lat: Number(e.latitude),
      lng: Number(e.longitude),
      name: e.title,
      subtitle: [e.city, e.start_date?.slice(0, 10)].filter(Boolean).join(' · ') || undefined,
      linkTo: e.slug ? `/events/${e.slug}` : undefined,
      type: 'events' as const,
    }));
}

function dateLabel(d: ObservanceDateRow, kind: ObservanceIndexRow['kind'], lang: string) {
  const opts: Intl.DateTimeFormatOptions =
    kind === 'month'
      ? { month: 'long', timeZone: 'UTC' }
      : { day: 'numeric', month: 'long', timeZone: 'UTC' };
  return new Date(`${d.starts}T12:00:00Z`).toLocaleDateString(lang, opts);
}

export function observanceDatesText(row: ObservanceIndexRow, lang: string): string {
  return row.dates
    .map((d) =>
      d.country_name
        ? `${d.country_name}: ${dateLabel(d, row.kind, lang)}`
        : dateLabel(d, row.kind, lang),
    )
    .join(' · ');
}
