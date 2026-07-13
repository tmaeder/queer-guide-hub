// Section definitions for the editorial CityDetail. Order is rendered top-to-bottom
// and drives the sticky section nav. Section IDs match the legacy CITY_TAB_DEFS ids
// 1:1 so EditorialDetailLayout's ?tab=→?section= redirect keeps old deep-links working.
//
// Order leads with the queer-travel jobs (safety → where to go → what's on → map →
// voices) before the encyclopedic "About", then getting-there / news / nearby.

export type CitySectionId =
  | 'rights'
  | 'venues'
  | 'events'
  | 'map'
  | 'personalities'
  | 'overview'
  | 'travel'
  | 'news'
  | 'nearby';

export interface CitySectionDef {
  id: CitySectionId;
  /** Sticky-nav label — short. */
  label: string;
  /** Editorial section heading — fuller voice. */
  heading: string;
  /** Optional eyebrow. Only where it adds information the heading doesn't
   *  carry — a kicker on every section is scaffolding, not voice
   *  (2026-07 critique: eyebrow saturation was the site's top AI tell). */
  kicker?: string;
}

export const CITY_SECTION_DEFS: CitySectionDef[] = [
  { id: 'rights', label: 'Safety', heading: 'Safety & rights', kicker: 'Know before you go' },
  { id: 'venues', label: 'Venues', heading: 'Where to go', kicker: 'Bars, clubs & spaces' },
  { id: 'events', label: 'Events', heading: "What's on" },
  { id: 'map', label: 'Map', heading: 'On the map' },
  { id: 'personalities', label: 'Voices', heading: 'Voices', kicker: 'People & history' },
  { id: 'overview', label: 'About', heading: 'About the city' },
  { id: 'travel', label: 'Travel', heading: 'Getting there' },
  { id: 'news', label: 'News', heading: 'In the news' },
  { id: 'nearby', label: 'Nearby', heading: 'Nearby' },
];
