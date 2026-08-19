import { formatDistance } from '@/lib/formatDistance';
import { timeUntil } from '@/utils/relativeTime';
import type { LayerType } from '@/hooks/useExploreMapData';
import type { MapPointSummary } from '../mapPoint';

/**
 * Map-layer type → route-bullet key.
 *
 * `LayerType` is plural (`venues`) and `ROUTE_BULLET_MAP` is keyed by the
 * singular search_documents entity vocab (`venue`), so the two cannot be
 * joined by string surgery — `neighbourhoods` is `queer_village`, which no
 * amount of de-pluralising produces. This table is the join.
 */
const LAYER_BULLET: Record<LayerType, string> = {
  venues: 'venue',
  events: 'event',
  cities: 'city',
  countries: 'country',
  restrooms: 'restroom',
  hotels: 'hotel',
  neighbourhoods: 'queer_village',
};

export const bulletTypeForLayer = (type: LayerType): string => LAYER_BULLET[type] ?? 'venue';

/**
 * The board's second column.
 *
 * A departure board's defining column is WHEN, and only events have one. The
 * other layers are places: for them the honest analogue of "when" is how far
 * away it is, which is the same question a traveller is actually asking. When
 * neither is known the column is an em-dash — the repo's absence convention —
 * because inventing a plausible time is the one thing a board must never do.
 */
export function departureTime(point: MapPointSummary): string {
  if (point.type === 'events') {
    if (point.live) return 'Now';
    const countdown = timeUntil(point.startDate);
    if (countdown) return countdown;
  }
  if (point.distanceKm != null) {
    const d = formatDistance(point.distanceKm * 1000);
    if (d) return d;
  }
  return '—';
}

/**
 * The board's status column, in priority order: the most time-sensitive fact
 * wins, because a board has room for exactly one.
 *
 * `urgent` drives a pink station dot rather than colouring the text, so the
 * state is never encoded by hue alone (WCAG 1.4.1) — the label carries it.
 */
export function departureStatus(point: MapPointSummary): {
  status?: string;
  urgent?: boolean;
} {
  if (point.type === 'events' && point.live) return { status: 'Live', urgent: true };
  if (point.openNow === true) return { status: 'Open' };
  if (point.openNow === false) return { status: 'Closed' };
  if (point.featured) return { status: 'Featured' };
  return {};
}
