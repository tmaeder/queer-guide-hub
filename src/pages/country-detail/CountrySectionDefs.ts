// Section definitions for the editorial CountryDetail. The eight legacy ids
// match COUNTRY_TAB_DEFS 1:1 so EditorialDetailLayout's ?tab=→?section=
// redirect stays clean. The two new editorial bands (#personalities, #nearby)
// are appended — they have no legacy tab to redirect from.

export type CountrySectionId =
  | 'overview'
  | 'rights'
  | 'cities'
  | 'venues'
  | 'events'
  | 'personalities'
  | 'news'
  | 'travel'
  | 'nearby'
  | 'map';

export interface CountrySectionDef {
  id: CountrySectionId;
  label: string;
}

export const COUNTRY_SECTION_DEFS: CountrySectionDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'rights', label: 'Rights' },
  { id: 'cities', label: 'Cities' },
  { id: 'venues', label: 'Venues' },
  { id: 'events', label: 'Events' },
  { id: 'personalities', label: 'Voices' },
  { id: 'news', label: 'News' },
  { id: 'travel', label: 'Travel' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'map', label: 'Map' },
];
