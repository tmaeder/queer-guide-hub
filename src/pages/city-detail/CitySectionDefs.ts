// Section definitions for the editorial CityDetail. Order is rendered top-to-bottom,
// also drives the sticky section nav. Section IDs match the legacy CITY_TAB_DEFS ids
// 1:1 so EditorialDetailLayout's ?tab=→?section= redirect stays clean.

export type CitySectionId =
  | 'overview'
  | 'rights'
  | 'venues'
  | 'events'
  | 'personalities'
  | 'news'
  | 'travel'
  | 'nearby'
  | 'map';

export interface CitySectionDef {
  id: CitySectionId;
  label: string;
}

// The seven legacy ids match CITY_TAB_DEFS 1:1 so the EditorialDetailLayout's
// ?tab=→?section= redirect stays clean. The two new editorial bands
// (#personalities, #nearby) are appended — they have no legacy tab.
export const CITY_SECTION_DEFS: CitySectionDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'rights', label: 'Rights' },
  { id: 'venues', label: 'Venues' },
  { id: 'events', label: 'Events' },
  { id: 'personalities', label: 'Voices' },
  { id: 'news', label: 'News' },
  { id: 'travel', label: 'Travel' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'map', label: 'Map' },
];
