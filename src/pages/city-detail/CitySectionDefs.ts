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
  kicker: string;
}

export const CITY_SECTION_DEFS: CitySectionDef[] = [
  { id: 'rights', label: 'Safety', heading: 'Safety & rights', kicker: 'Know before you go' },
  { id: 'venues', label: 'Venues', heading: 'Where to go', kicker: 'Bars, clubs & spaces' },
  { id: 'events', label: 'Events', heading: "What's on", kicker: 'Upcoming' },
  { id: 'map', label: 'Map', heading: 'On the map', kicker: 'Explore' },
  { id: 'personalities', label: 'Voices', heading: 'Voices', kicker: 'People & history' },
  { id: 'overview', label: 'About', heading: 'About the city', kicker: 'Context' },
  { id: 'travel', label: 'Travel', heading: 'Getting there', kicker: 'Plan the trip' },
  { id: 'news', label: 'News', heading: 'In the news', kicker: 'Latest' },
  { id: 'nearby', label: 'Nearby', heading: 'Nearby', kicker: 'Keep exploring' },
];
