import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classify,
  dedupeEvents,
  flatLocation,
  imageUrls,
  toVenueHours,
  ORG_ROLE,
  targetGroups,
  TAXON_SUPPLEMENTARY,
  TAXON_UNRESOLVED,
  toSchedule,
  VENUE_CATEGORY,
  type AgendaqBusiness,
} from './agendaq-parse.ts';

// Fixtures are real rows from the 2026-10-05 corpus pull, trimmed.

Deno.test('classify: venue category from taxon', () => {
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [65, 179] }).lane, 'venue');
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [65, 179] }).category, 'bar');
});

Deno.test('classify: a *-backroom keeps the PRIMARY category', () => {
  // A bar with a backroom is a bar; the backroom is an amenity. Mapping it to
  // `cruising` would safety-gate 148 ordinary bars out of anonymous browse.
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [67] }).category, 'bar');
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [70] }).category, 'sauna');
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [73] }).category, 'club');
});

Deno.test('classify: only a dedicated cruising venue takes `cruising`', () => {
  for (const t of [66, 99, 117]) {
    assertEquals(classify({ slug: 'x', name: 'x', taxons: [t] }).category, 'cruising');
  }
});

Deno.test('classify: plage maps to outdoor, never the illegal `beach`', () => {
  const c = classify({ slug: 'x', name: 'x', taxons: [116] });
  assertEquals(c.category, 'outdoor');
});

Deno.test('classify: every mapped venue category is in the closed vocabulary', () => {
  // Mirrors venues_category_check / src/lib/venueCategories.ts. A value outside
  // this set is a hard constraint violation at commit, not a soft fallback.
  const legal = new Set([
    'bar', 'club', 'cafe', 'restaurant', 'hotel', 'sauna', 'cruising', 'outdoor',
    'shop', 'community_center', 'event-venue', 'theater', 'gallery', 'salon',
    'gym', 'toilet', 'other',
  ]);
  for (const v of Object.values(VENUE_CATEGORY)) {
    assertEquals(legal.has(v), true, `illegal venues.category: ${v}`);
  }
});

Deno.test('classify: orgs go to the org lane, not to venues', () => {
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [68] }).orgRole, 'health');
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [64] }).orgRole, 'association');
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [101] }).orgRole, 'public-body');
  // and never land a category
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [68] }).category, undefined);
});

Deno.test('classify: a venue category wins over an org role', () => {
  // Zero rows carry both today; the ordering exists so a future both-tagged row
  // cannot change lane depending on taxon array order.
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [64, 65] }).lane, 'venue');
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [65, 64] }).lane, 'venue');
});

Deno.test('classify: not-a-place is skipped', () => {
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [63] }).lane, 'skip');
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [100] }).lane, 'skip');
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [102] }).lane, 'skip');
});

Deno.test('classify: a sole-marker taxon yields `other`, never a guessed category', () => {
  // `beef` carries only taxon 118 and agendaq renders it as
  // "Pas d'information sur cet établissement". Inferring "Beef" is a
  // restaurant is the refuge-restrooms failure (167 wrong categories).
  const beef: AgendaqBusiness = { slug: 'beef', name: 'Beef', taxons: [118] };
  assertEquals(classify(beef).lane, 'other');
  assertEquals(classify(beef).category, 'other');
  // abraxas-run carries only 127, same shape
  assertEquals(classify({ slug: 'abraxas-run', name: 'Abraxas Run', taxons: [127] }).category, 'other');
  // and with no taxons at all
  assertEquals(classify({ slug: 'boy-store', name: 'Boy Store', taxons: [] }).category, 'other');
});

Deno.test('the two unknown-taxon groups are disjoint and stay distinguishable', () => {
  for (const t of TAXON_UNRESOLVED) {
    assertEquals(TAXON_SUPPLEMENTARY.has(t), false, `taxon ${t} is in both groups`);
  }
  // A supplementary taxon must never decide a lane on its own...
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [98] }).category, 'other');
  // ...and must never shadow a real category.
  assertEquals(classify({ slug: 'x', name: 'x', taxons: [98, 65] }).category, 'bar');
});

Deno.test('targetGroups maps the audience facet only', () => {
  assertEquals(targetGroups({ taxons: [178, 182, 65, 98] }), ['gay-only', 'trans-only']);
  assertEquals(targetGroups({ taxons: [] }), []);
});

// ── schedule ──────────────────────────────────────────────────────────────

Deno.test('toSchedule: weekly rule, w.0 is SUNDAY (verified via ludiqueer)', () => {
  // Real row: only w.1 true, start 2024-09-02 — a MONDAY. If 0 were Monday this
  // would come out TU and every recurring night would be shifted a day.
  const s = toSchedule({
    tz: 'Europe/Paris',
    start: '2024-09-02',
    end: '2025-05-26',
    startH: '18:00',
    endH: '21:00',
    every: 1,
    recurring: 'w',
    'w.0': false,
    'w.1': true,
    'w.2': false,
    'w.3': false,
    'w.4': false,
    'w.5': false,
    'w.6': false,
  })!;
  assertEquals(s.kind, 'recurrence');
  assertEquals(s.tz, 'Europe/Paris');
  assertEquals(s.until, '2025-05-26');
  assertEquals(s.weekly, [{ day: 'MO', start: '18:00', end: '21:00' }]);
});

Deno.test('toSchedule: Sunday flag maps to SU', () => {
  const s = toSchedule({ recurring: 'w', startH: '23:00', endH: '04:00', 'w.0': true })!;
  assertEquals(s.weekly, [{ day: 'SU', start: '23:00', end: '04:00' }]);
});

Deno.test('toSchedule: weekly is always an array (the CHECK rejects anything else)', () => {
  const s = toSchedule({ recurring: 'w', 'w.5': true, 'w.6': true, startH: '23:00', endH: '05:00' })!;
  assertEquals(Array.isArray(s.weekly), true);
  assertEquals((s.weekly as unknown[]).length, 2);
});

Deno.test('toSchedule: a weekly rule with no day flagged yields null', () => {
  // Storing it would persist a rule that can never produce a date.
  assertEquals(toSchedule({ recurring: 'w', startH: '20:00' }), null);
});

Deno.test('toSchedule: daily rule covers all seven days', () => {
  const s = toSchedule({ recurring: 'd', startH: '14:00', endH: '02:00', tz: 'Europe/Brussels' })!;
  assertEquals((s.weekly as unknown[]).length, 7);
  assertEquals(s.tz, 'Europe/Brussels');
});

Deno.test('toSchedule: monthly is not representable and returns null, not an empty rule', () => {
  assertEquals(toSchedule({ recurring: 'm', startH: '20:00' }), null);
});

Deno.test('toSchedule: a non-recurring rule gets no schedule', () => {
  assertEquals(toSchedule({ recurring: '', start: '2024-12-21', startH: '12:00' }), null);
  assertEquals(toSchedule(null), null);
  assertEquals(toSchedule(undefined), null);
});

Deno.test('toSchedule: a 23:00 to 04:00 night is passed through unchanged', () => {
  // The expander rolls close <= open to the next day itself; normalising here
  // would double-apply it.
  const s = toSchedule({ recurring: 'w', 'w.6': true, startH: '23:00', endH: '04:00' })!;
  assertEquals(s.weekly, [{ day: 'SA', start: '23:00', end: '04:00' }]);
});

Deno.test('toVenueHours: real 101-club hours in the live venues.hours shape', () => {
  // day 1..7 Monday-first, HHMM with no colon, `+` prefix for a next-day close.
  const h = toVenueHours([
    ['dow', 1, '14:00', '22:00'],
    ['dow', 6, '14:00', '04:00'],
    ['dow', 0, '14:00', '22:00'],
  ])!;
  assertEquals(h.source, 'agendaq');
  assertEquals(h.regular, [
    { day: 1, open: '1400', close: '2200' },
    { day: 6, open: '1400', close: '+0400' }, // closes after midnight
    { day: 7, open: '1400', close: '2200' }, // Sunday moved 0 -> 7
  ]);
});

Deno.test('toVenueHours: Sunday must become 7, never stay 0', () => {
  // Leaving it at 0 silently files every Sunday as a Monday; no live row has day 0.
  const h = toVenueHours([['dow', 0, '10:00', '18:00']])!;
  assertEquals((h.regular as Array<{ day: number }>)[0].day, 7);
});

Deno.test('toVenueHours: carries no events-schedule keys', () => {
  // commit_venue_staging_item accepts ANY object here, so a schedule-shaped
  // payload would be stored silently and understood by nothing.
  const h = toVenueHours([['dow', 3, '14:00', '02:00']])!;
  assertEquals('weekly' in h, false);
  assertEquals('kind' in h, false);
  assertEquals('tz' in h, false);
});

Deno.test('toVenueHours: a close equal to open is still next-day', () => {
  const h = toVenueHours([['dow', 5, '22:00', '22:00']])!;
  assertEquals((h.regular as Array<{ close: string }>)[0].close, '+2200');
});

Deno.test('toVenueHours: empty or junk yields null', () => {
  assertEquals(toVenueHours([]), null);
  assertEquals(toVenueHours(null), null);
  assertEquals(toVenueHours([['dow', 9, '10:00', '11:00']]), null);
});

// ── location ──────────────────────────────────────────────────────────────

Deno.test('flatLocation: builds the street from sn + street, not from label', () => {
  // `label` is a display string that also carries city and postcode, so using
  // it as the address duplicates them into the street field.
  const l = flatLocation([
    {
      id: 5814,
      label: '16, Rue Mathieu Donnart, Brest, 29200',
      lat: 48.3982771,
      lon: -4.4837348,
      cc: 'fr',
      addr: { pc: '29200', sn: '16', city: 'Brest', region: 'Bretagne', street: 'Rue Mathieu Donnart' },
    },
  ])!;
  assertEquals(l.address, '16 Rue Mathieu Donnart');
  assertEquals(l.city, 'Brest');
  assertEquals(l.postal_code, '29200');
  assertEquals(l.region, 'Bretagne');
  assertEquals(l.country_code, 'FR'); // upper-cased
  assertEquals(l.latitude, 48.3982771);
});

Deno.test('flatLocation: missing coordinates stay null rather than 0', () => {
  const l = flatLocation([{ id: 1, cc: 'IT', addr: { city: 'Rome' } }])!;
  assertEquals(l.latitude, null);
  assertEquals(l.longitude, null);
  assertEquals(l.address, null);
});

Deno.test('flatLocation: no location yields null', () => {
  assertEquals(flatLocation([]), null);
  assertEquals(flatLocation(undefined), null);
});

Deno.test('imageUrls: host-relative asset paths are absolutised', () => {
  assertEquals(
    imageUrls([['main', '/assets/businesses/101-club/main.jpg?S0MbmmDw', 'image/jpeg', 240, 240, 0]]),
    ['https://data.agendaq.fr/assets/businesses/101-club/main.jpg?S0MbmmDw'],
  );
});

// ── events ────────────────────────────────────────────────────────────────

Deno.test('dedupeEvents: one event repeating across businesses is staged once', () => {
  // The raw per-business count is ~35k against 16,433 distinct. Not deduping
  // stages the same party once per venue it runs at.
  const shared = { slug: 'clubbing-66', name: 'Clubbing' };
  const out = dedupeEvents([
    { slug: 'a', name: 'A', events: [shared] },
    { slug: 'b', name: 'B', events: [shared] },
    { slug: 'c', name: 'C', events: [{ slug: 'other', name: 'Other' }] },
  ]);
  assertEquals(out.length, 2);
  assertEquals(out.map((e) => e.slug).sort(), ['clubbing-66', 'other']);
});

Deno.test('dedupeEvents: a business with no events contributes nothing', () => {
  assertEquals(dedupeEvents([{ slug: 'a', name: 'A' }]).length, 0);
});

// ── licence boundary ──────────────────────────────────────────────────────

Deno.test('ORG_ROLE and VENUE_CATEGORY never claim the same taxon', () => {
  for (const t of Object.keys(ORG_ROLE)) {
    assertEquals(VENUE_CATEGORY[Number(t)], undefined, `taxon ${t} is in both maps`);
  }
});
