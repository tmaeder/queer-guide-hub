// Section ids for the city single. Order is rendered top-to-bottom and drives
// the route rail's stations.
//
// Ids are unchanged from the legacy tab set where the section survived, so old
// `?tab=` / `?section=` deep links and the `#rights` jump target from the
// safety verdict keep resolving. `districts` is new (the queer villages were
// buried at the bottom of the venue grid); `overview` was renamed nowhere —
// it kept its id even though its heading changed.
//
// Order leads with the queer-travel jobs — safety, then where to go, then the
// districts, then what's on — before the encyclopaedic "About", then getting
// there and news.
//
// `personalities` and `nearby` are NOT sections any more. Both are composite
// rails that self-hide from inside their own bodies, which the section filter
// cannot see, so each would leave a station on the route rail pointing at an
// empty heading. They render in the page footer, where there are no stations.
//
// Unlike the version this replaces, there is no `label` field. It carried a
// short sticky-nav label that the page never read: `CityDetail` passed
// `def.heading` as the nav label, so "Safety" was dead code for its whole life
// while the nav showed "Safety & rights". One string, one use.

export type CitySectionId =
  | 'rights'
  | 'venues'
  | 'districts'
  | 'events'
  | 'overview'
  | 'travel'
  | 'news';

export const CITY_SECTION_ORDER: CitySectionId[] = [
  'rights',
  'venues',
  'districts',
  'events',
  'overview',
  'travel',
  'news',
];
