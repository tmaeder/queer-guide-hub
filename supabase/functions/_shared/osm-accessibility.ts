// OpenStreetMap accessibility tags -> public.amenities (kind='accessibility') slugs.
// Pure. No I/O. Shared by source-osm-venue (discovery) and venue-accessibility-osm
// (coordinate-keyed enrichment) so the two can never disagree about what a tag means.
//
// Replaces the single line `if (tags.wheelchair === 'yes')` in
// source-osm-venue/index.ts:106, which (a) read only one of the four values OSM
// defines and (b) pushed the result into `venues.tags`, where the controlled
// queer vocabulary in normalize_venue_tags() default-rejected it — so the claim
// was dropped at commit and 0 venues ever carried it.
//
// TWO RULES
// ---------
// 1. A `no` is a MEASUREMENT, not an absence. `wheelchair=no` means a mapper
//    stood there and recorded that you cannot get in. It maps to a first-class
//    negative slug and is never silently dropped.
// 2. This mapper never resolves a contradiction. If one OSM element says
//    `wheelchair=no` and `toilets:wheelchair=yes`, both are emitted and the
//    consensus layer decides — resolving here would hide the disagreement from
//    the engine whose whole job is to surface it.

/** OSM values that assert the feature is present. */
const YES = new Set(['yes', 'designated'])

/**
 * Every slug this mapper can produce. The migration asserts each one exists in
 * `public.amenities` with kind='accessibility' — a slug the vocabulary lacks
 * would be written and then default-rejected downstream, which renders as "no
 * data" and is indistinguishable from never having looked.
 */
export const OSM_ACCESSIBILITY_SLUGS: readonly string[] = [
  'accessible-parking',
  'accessible-restroom',
  'elevator-access',
  'gender-neutral-restroom',
  'hearing-loop',
  'limited-wheelchair-access',
  'no-accessible-restroom',
  'not-step-free',
  'not-wheelchair-accessible',
  'ramp-access',
  'step-free-entrance',
  'tactile-paving',
  'wheelchair-accessible',
]

/**
 * Map one OSM element's tag bag to controlled accessibility slugs.
 * Returns a sorted, de-duplicated array; `[]` means the element says nothing
 * about access, which is NOT the same as saying it is inaccessible.
 */
export function osmAccessibility(tags: Record<string, string>): string[] {
  const out = new Set<string>()
  const v = (k: string) => String(tags?.[k] ?? '').trim().toLowerCase()

  // wheelchair=yes|designated|limited|no — all four, which is the whole point.
  // `limited` is neither pole: OSM means partly accessible, so it gets its own
  // term rather than being rounded up into a promise or down into a refusal.
  const wheelchair = v('wheelchair')
  if (YES.has(wheelchair)) out.add('wheelchair-accessible')
  else if (wheelchair === 'limited') out.add('limited-wheelchair-access')
  else if (wheelchair === 'no') out.add('not-wheelchair-accessible')

  const toiletWheelchair = v('toilets:wheelchair')
  if (YES.has(toiletWheelchair)) out.add('accessible-restroom')
  else if (toiletWheelchair === 'no') out.add('no-accessible-restroom')

  // toilets:unisex is the venue-scoped form; bare unisex is used on a toilets
  // feature itself. `no` asserts nothing — a segregated toilet is not a claim we
  // have a vocabulary term for, and inventing one would over-read the tag.
  if (YES.has(v('toilets:unisex')) || YES.has(v('unisex'))) out.add('gender-neutral-restroom')

  if (YES.has(v('ramp')) || YES.has(v('ramp:wheelchair'))) out.add('ramp-access')
  if (YES.has(v('elevator')) || v('highway') === 'elevator') out.add('elevator-access')
  if (YES.has(v('tactile_paving'))) out.add('tactile-paving')
  if (YES.has(v('hearing_loop')) || YES.has(v('induction_loop'))) out.add('hearing-loop')

  // step_count is a count, so the polarity comes from the NUMBER. Junk text
  // asserts nothing rather than defaulting to a side.
  const steps = v('step_count')
  if (/^\d+$/.test(steps)) out.add(Number(steps) === 0 ? 'step-free-entrance' : 'not-step-free')

  // capacity:disabled is a parking-space count. Only a positive count (or a bare
  // `yes`) asserts anything; `0`/`no` is an absence we have no term for.
  const disabledCapacity = v('capacity:disabled')
  if (YES.has(disabledCapacity) || /^\d+$/.test(disabledCapacity) && Number(disabledCapacity) > 0) {
    out.add('accessible-parking')
  }

  // Deliberately NOT read: wheelchair:description (free prose — LLM territory,
  // and LLM-extracted accessibility is always review-gated, never auto-applied),
  // kerb (describes a crossing, not the venue).

  return [...out].sort()
}
