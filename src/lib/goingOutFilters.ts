import type { TransitIconName } from '@/components/transit/transitIconPaths';

/**
 * Filter vocabularies for /going-out.
 *
 * Event groups are unions of real `events.event_type` values (src/lib/eventTypes.ts).
 * Measured over future active events (2026-11): other 5644, drag 2238, pride 611,
 * community 583, party 216, fetish 158, theater 122, festival 117, film 94,
 * sports 86, meetup 77, social 72, … — so `other` is only reachable via "All".
 */
export interface EventTypeGroup {
  id: string;
  icon: TransitIconName;
  label: string;
  types: string[];
}

export const EVENT_TYPE_GROUPS: EventTypeGroup[] = [
  { id: 'party', icon: 'disco', label: 'Parties', types: ['party', 'fetish', 'cruise'] },
  {
    id: 'drag',
    icon: 'stage',
    label: 'Drag & shows',
    types: ['drag', 'theater', 'comedy', 'concert'],
  },
  { id: 'pride', icon: 'pride', label: 'Pride & festivals', types: ['pride', 'festival', 'fair'] },
  { id: 'film', icon: 'film', label: 'Film & art', types: ['film', 'art', 'exhibition'] },
  {
    id: 'social',
    icon: 'meetups',
    label: 'Social & meetups',
    types: ['social', 'meetup', 'community', 'sports'],
  },
  {
    id: 'talks',
    icon: 'library',
    label: 'Talks & workshops',
    types: ['workshop', 'conference', 'fundraiser', 'protest'],
  },
];

export function eventTypesFor(groupId: string | null): string[] | undefined {
  return EVENT_TYPE_GROUPS.find((g) => g.id === groupId)?.types;
}

/**
 * "Where to go" filters. `venues` filters carry `venues.category` values
 * (src/lib/venueCategories.ts); `organizations` and `neighbourhoods` switch the
 * source. Cruising, restrooms and `other` are deliberately absent: cruising is
 * safety-gated, restrooms are not a night out, and `other` is ~59% of venues.
 */
export type PlaceFilter =
  | { id: string; icon: TransitIconName; label: string; kind: 'venues'; categories: string[] }
  | { id: string; icon: TransitIconName; label: string; kind: 'organizations' | 'neighbourhoods' };

export const PLACE_FILTERS: PlaceFilter[] = [
  { id: 'bars', icon: 'nightlife', label: 'Bars', kind: 'venues', categories: ['bar'] },
  {
    id: 'clubs',
    icon: 'disco',
    label: 'Clubs',
    kind: 'venues',
    categories: ['club', 'event-venue'],
  },
  { id: 'cafes', icon: 'cafe', label: 'Cafés', kind: 'venues', categories: ['cafe'] },
  {
    id: 'food',
    icon: 'restaurant',
    label: 'Restaurants',
    kind: 'venues',
    categories: ['restaurant'],
  },
  { id: 'saunas', icon: 'sauna', label: 'Saunas', kind: 'venues', categories: ['sauna'] },
  {
    id: 'culture',
    icon: 'theater',
    label: 'Theatre & galleries',
    kind: 'venues',
    categories: ['theater', 'gallery'],
  },
  {
    id: 'community',
    icon: 'community',
    label: 'Community centres',
    kind: 'venues',
    categories: ['community_center'],
  },
  { id: 'shops', icon: 'shop', label: 'Shops', kind: 'venues', categories: ['shop'] },
  {
    id: 'wellness',
    icon: 'gym',
    label: 'Gyms & salons',
    kind: 'venues',
    categories: ['gym', 'salon'],
  },
  { id: 'outdoor', icon: 'outdoor', label: 'Outdoors', kind: 'venues', categories: ['outdoor'] },
  { id: 'organizations', icon: 'info-point', label: 'Organisations', kind: 'organizations' },
  { id: 'neighbourhoods', icon: 'pride', label: 'Neighbourhoods', kind: 'neighbourhoods' },
];

/** Every venue category the unfiltered "All" view lists. */
export const ALL_PLACE_CATEGORIES = PLACE_FILTERS.flatMap((f) =>
  f.kind === 'venues' ? f.categories : [],
);

export const PLACE_VIEWS = ['grid', 'list', 'map'] as const;
export type PlaceView = (typeof PLACE_VIEWS)[number];

export function parsePlaceView(raw: string | null): PlaceView {
  return (PLACE_VIEWS as readonly string[]).includes(raw ?? '') ? (raw as PlaceView) : 'grid';
}
