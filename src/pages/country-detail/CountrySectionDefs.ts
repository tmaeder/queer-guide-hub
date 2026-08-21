// Section ids for the country single. Order is destination-led but
// safety-first: the rights breakdown leads (it's why the platform exists),
// then the legal record that dates it, then the trip-planning funnel
// (cities → venues → events → travel), then context.
//
// Ids that match the retired COUNTRY_TAB_DEFS 1:1 (rights/cities/venues/
// events/travel/news/map) keep old `?tab=` / `?section=` deep links resolving,
// and `#rights` is the jump target the safety verdict links to.
//
// `history` is the type's OWNER module (spec module 12): "a country page is a
// living legal record; safety information without a date is dangerous." It is
// no longer its own SECTION: the timeline renders as a sub-block inside
// `rights` (the record is the rights story's evidence), wrapped in a
// `div#history` so old `#history` deep links still land. That is why the id is
// absent from the order below but must never be reused for a new section.
//
// `personalities` and `nearby` are NOT sections. Both are composite rails that
// self-hide from inside their own bodies, which the section filter cannot see,
// so each would leave a station on the route rail pointing at an empty
// heading. They render in the page footer, where there are no stations.
//
// The `label` field is gone. The page builds each section's heading from a
// `country.section.*` key at the call site, where the interpolated country
// name is in scope — a second English fallback stored here could only drift
// from the one actually rendered.

export type CountrySectionId =
  'rights' | 'cities' | 'venues' | 'events' | 'travel' | 'stats' | 'news';

export const COUNTRY_SECTION_ORDER: CountrySectionId[] = [
  'rights',
  'cities',
  'venues',
  'events',
  'travel',
  'stats',
  'news',
];
