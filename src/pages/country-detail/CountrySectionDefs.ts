// Section definitions for the editorial CountryDetail page. Order is
// destination-led but safety-first: the rights breakdown leads the deep
// sections (it's why the platform exists), then the trip-planning funnel
// (cities → venues → events → travel), then context (stats → voices →
// nearby → news → map).
//
// Ids that match the retired COUNTRY_TAB_DEFS 1:1 (rights/cities/venues/
// events/travel/news/map) keep EditorialDetailLayout's ?tab=→?section=
// redirect working. `overview` was dissolved into the header + stats/
// practical bands; `stats` is new. Labels here are English fallbacks —
// CountryDetail translates them via t(`country.section.${id}`).

export type CountrySectionId =
  | 'rights'
  | 'cities'
  | 'venues'
  | 'events'
  | 'travel'
  | 'stats'
  | 'personalities'
  | 'nearby'
  | 'news'
  | 'map';

export interface CountrySectionDef {
  id: CountrySectionId;
  label: string;
}

export const COUNTRY_SECTION_DEFS: CountrySectionDef[] = [
  { id: 'rights', label: 'Rights & safety' },
  { id: 'cities', label: 'Cities' },
  { id: 'venues', label: 'Venues' },
  { id: 'events', label: 'Events' },
  { id: 'travel', label: 'Travel' },
  { id: 'stats', label: 'In numbers' },
  { id: 'personalities', label: 'Voices' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'news', label: 'News' },
  { id: 'map', label: 'Map' },
];
