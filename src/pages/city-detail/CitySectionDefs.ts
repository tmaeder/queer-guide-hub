// Section definitions for the editorial CityDetail. Order is rendered top-to-bottom,
// also drives the sticky section nav. Section IDs match the legacy CITY_TAB_DEFS ids
// 1:1 so EditorialDetailLayout's ?tab=→?section= redirect stays clean.

export interface CitySectionDef {
  id: 'overview' | 'rights' | 'venues' | 'events' | 'travel' | 'news' | 'map';
  label: string;
}

export const CITY_SECTION_DEFS: CitySectionDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'rights', label: 'Rights' },
  { id: 'venues', label: 'Venues' },
  { id: 'events', label: 'Events' },
  { id: 'travel', label: 'Travel' },
  { id: 'news', label: 'News' },
  { id: 'map', label: 'Map' },
];
