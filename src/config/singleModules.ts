/**
 * The single-page content model, transcribed from the design project's
 * "Content Singles Spec.dc.html".
 *
 * The spec's own framing: "A single is not a template. It is a spine plus the
 * modules that type actually needs, in a fixed order." This file is that
 * statement made executable — the spine, the 16-module inventory, and the
 * per-type matrix. Page components read the registry rather than hand-rolling
 * a stack, which is what keeps thirteen types feeling like one system.
 *
 * The four RULES most likely to be violated by a well-meaning page author,
 * quoted from the spec because they are the ones that cost something:
 *
 *   1. "Module order is fixed across types. A rider who learns one single has
 *      learned all thirteen." — so order lives HERE, not at the call site.
 *   2. "A module with no data does not render. No empty shells, no coming
 *      soon, no zero states pretending to be content."
 *   3. "Tags render as one unstyled array with zero hierarchy, never split
 *      into primary and secondary rows."
 *   4. "Cross-type links use the other type's bullet and color, so the network
 *      is legible from inside any page."
 */

/** S1–S8. Carried by every type, in this order, with no exceptions. */
export const SINGLE_SPINE = [
  { id: 'breadcrumb', label: 'Breadcrumb', note: 'Line, then parent, then this page. Three levels or fewer.' },
  { id: 'bullet', label: 'Bullet and kicker', note: "Route bullet in the type's colour, plus its track." },
  { id: 'title', label: 'Title and standfirst', note: 'Anton title, one sentence of what this is.' },
  { id: 'tags', label: 'Tag array', note: 'Equal weight, never truncated behind a more link.' },
  { id: 'action', label: 'Primary action', note: 'One concrete verb. Never "Learn more".' },
  { id: 'provenance', label: 'Provenance', note: 'Who added it, when checked, how to correct it.' },
  { id: 'sameline', label: 'On the same line', note: 'Related items as a bending line, typed by bullet.' },
  { id: 'safety', label: 'Safety footer', note: 'Report, block, anti-discrimination. Every type.' },
] as const;

export type SpineId = (typeof SINGLE_SPINE)[number]['id'];

/** The 16 modules. `slot` mirrors the spec's Head / Body / Rail column. */
export const SINGLE_MODULES = [
  { n: 1, id: 'fact-strip', label: 'Fact strip', slot: 'head', carries: 'when, where, cost, access' },
  { n: 2, id: 'hours', label: 'Hours table', slot: 'body', carries: 'opening hours, holidays' },
  { n: 3, id: 'occurrences', label: 'Occurrence board', slot: 'body', carries: 'dates, times, status' },
  { n: 4, id: 'access', label: 'Access panel', slot: 'body', carries: 'access facts' },
  { n: 5, id: 'stops', label: 'Stop list', slot: 'body', carries: 'sequence, duration' },
  { n: 6, id: 'checklist', label: 'Checklist', slot: 'body', carries: 'steps, waits, forms' },
  { n: 7, id: 'roster', label: 'Roster', slot: 'body', carries: 'people, roles' },
  { n: 8, id: 'nested-entity', label: 'Nested entity card', slot: 'body', carries: 'linked entity' },
  { n: 9, id: 'variants', label: 'Variant picker', slot: 'body', carries: 'variants, price band' },
  { n: 10, id: 'itinerary', label: 'Itinerary', slot: 'body', carries: 'days, bookings' },
  { n: 11, id: 'vouches', label: 'Vouches', slot: 'body', carries: 'vouches, checks' },
  { n: 12, id: 'history', label: 'Version history', slot: 'body', carries: 'revisions, dates' },
  { n: 13, id: 'boundaries', label: 'Boundaries', slot: 'body', carries: 'limits, consent' },
  { n: 14, id: 'membership', label: 'Membership state', slot: 'rail', carries: 'access model' },
  { n: 15, id: 'stats', label: 'Stat line', slot: 'rail', carries: 'counts, capacity' },
  { n: 16, id: 'map-inset', label: 'Map inset', slot: 'rail', carries: 'geo, neighbours' },
] as const;

export type ModuleId = (typeof SINGLE_MODULES)[number]['id'];

/**
 * Per-type stacks, by module NUMBER (the spec's own 01–16 labels).
 *
 * `required` — "the type is broken without it".
 * `conditional` — "used when the data exists".
 * Anything absent is "never on this type", which is a real instruction: a
 * module missing from a row must not be added because it happens to have data.
 */
export const SINGLE_TYPE_STACKS: Record<
  string,
  { label: string; required: number[]; conditional: number[]; owner: string }
> = {
  venue: { label: 'Venues', required: [1, 2, 4, 3, 11, 16, 8], conditional: [7, 15, 12], owner: 'Hours table' },
  event: { label: 'Events', required: [1, 3, 4, 8, 15], conditional: [7, 11, 16, 9], owner: 'Occurrence board' },
  country: { label: 'Countries', required: [1, 12, 16, 11], conditional: [6, 5, 15], owner: 'Version history' },
  city: { label: 'Cities', required: [1, 16, 3, 15], conditional: [5, 11, 2], owner: 'Map inset' },
  queer_village: { label: 'Queer Villages', required: [1, 16, 5, 4], conditional: [3, 11, 8], owner: 'Stop list' },
  personality: { label: 'Personalities', required: [1, 11, 7], conditional: [13, 3, 12, 8], owner: 'Vouches' },
  milestone: { label: 'Milestones', required: [1, 12, 11], conditional: [8, 16], owner: 'Version history' },
  news: { label: 'News', required: [1, 12, 11], conditional: [8, 7], owner: 'Provenance' },
  guide: { label: 'Guides', required: [1, 5, 4], conditional: [16, 12, 8, 15], owner: 'Stop list' },
  page: { label: 'Pages', required: [12], conditional: [1, 6, 11], owner: 'Version history' },
  // MODULE 09 (Variant picker) CANNOT RENDER, and that is a schema fact, not a
  // to-do someone forgot. `marketplace_listings` has no variant, size, colour,
  // option or SKU column at all — the nearest fields are `in_stock`,
  // `availability` and `price_type` — so rule 2 above applies: "a module with
  // no data does not render. No empty shells." The reasoned decision to keep
  // availability as a fact-strip fact instead is at
  // src/pages/MarketplaceItemDetail.parts.tsx (`ProductFacts`).
  //
  // The row still declares 09 because the spec does, and this file is a
  // transcription of the spec. Note the consequence though: this is the only
  // type whose OWNER module — the one meant to define it — is unrenderable.
  // Fixing that needs a variants data model, which is its own spec; do not
  // "resolve" it by wiring an empty picker.
  marketplace: { label: 'Marketplace', required: [1, 9, 15, 8], conditional: [11, 12, 4], owner: 'Variant picker' },
  organization: { label: 'Business', required: [1, 2, 4, 8, 11], conditional: [16, 3, 15, 7], owner: 'Nested entity card' },
  tag: { label: 'Tags (wiki)', required: [1, 12, 7], conditional: [11, 5, 15], owner: 'Version history' },
};

/**
 * Modules for a type, ALWAYS in spec order (ascending module number) rather
 * than the order they happen to be listed in the stack — rule 1.
 */
export function modulesForType(type: string): {
  module: (typeof SINGLE_MODULES)[number];
  required: boolean;
}[] {
  const stack = SINGLE_TYPE_STACKS[type];
  if (!stack) return [];
  return SINGLE_MODULES.filter(
    (m) => stack.required.includes(m.n) || stack.conditional.includes(m.n),
  ).map((m) => ({ module: m, required: stack.required.includes(m.n) }));
}

/** Whether a module may appear on a type at all ("never on this type"). */
export function moduleAllowed(type: string, moduleId: ModuleId): boolean {
  const m = SINGLE_MODULES.find((x) => x.id === moduleId);
  const stack = SINGLE_TYPE_STACKS[type];
  if (!m || !stack) return false;
  return stack.required.includes(m.n) || stack.conditional.includes(m.n);
}
