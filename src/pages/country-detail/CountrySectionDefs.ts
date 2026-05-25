// Section definitions for the editorial CountryDetail. IDs match COUNTRY_TAB_DEFS
// 1:1 so EditorialDetailLayout's ?tab=→?section= redirect stays clean.

export interface CountrySectionDef {
  id: 'overview' | 'rights' | 'cities' | 'venues' | 'events' | 'travel' | 'news' | 'map';
  label: string;
}

export const COUNTRY_SECTION_DEFS: CountrySectionDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'rights', label: 'Rights' },
  { id: 'cities', label: 'Cities' },
  { id: 'venues', label: 'Venues' },
  { id: 'events', label: 'Events' },
  { id: 'travel', label: 'Travel' },
  { id: 'news', label: 'News' },
  { id: 'map', label: 'Map' },
];
