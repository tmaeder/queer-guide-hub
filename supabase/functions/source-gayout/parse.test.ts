import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  TYPE_PRECEDENCE,
  countryFromPath,
  isPlaceholderImage,
  ldBlocks,
  normalizeDate,
  parseEventLd,
  parseWorkList,
  pathOf,
  resolveEventType,
  typesOf,
} from './parse.ts'

// Every fixture is the REAL JSON-LD gayout served on 2026-09-28, copied
// verbatim with only the surrounding page chrome removed. Hand-written JSON
// would test the parser against my idea of the source rather than the source.
const fixture = (name: string) =>
  Deno.readTextFileSync(new URL(`./__fixtures__/${name}`, import.meta.url))

const MASPALOMAS = fixture('detail-maspalomas.html')
const LAGOS = fixture('detail-lagos.html')
const LISTING = fixture('listing-itemlist.html')

const MASP_URL = 'https://www.gayout.com/europe/spain/maspalomas/mega-events/maspalomas-fetish-pride'
const LAGOS_URL = 'https://www.gayout.com/africa/nigeria/lagos/mega-events/pride-in-lagos'

// ─── work list ──────────────────────────────────────────────────────────────

Deno.test('work list comes from ItemList JSON-LD and dedupes repeated urls', () => {
  const items = parseWorkList(LISTING)

  // Positive control first: an empty result would satisfy every assertion below
  // about what the list does NOT contain.
  assert(items.length > 20, `expected a populated work list, got ${items.length}`)
  assertEquals(new Set(items.map(i => i.url)).size, items.length, 'urls must be unique')

  // The real listing carries 725 ListItems for 721 unique urls — three urls are
  // repeated (the same cruise sold from two ports, and one listed twice). This
  // fixture keeps those duplicates, so a parser that stopped deduping fails here.
  //
  // Read through `ldBlocks`, the parser's OWN extractor, rather than a second
  // regex written here. A duplicate `<script>` pattern in the test is free to
  // drift from the one in parse.ts — and the first version of this line did,
  // omitting the `i` flag that the real `LD_RE` carries, which CodeQL correctly
  // flagged as a case-sensitive HTML-filtering regexp.
  const itemList = ldBlocks(LISTING).find(b => typesOf(b).includes('ItemList'))
  assert(itemList, 'fixture has no ItemList block')
  const rawCount = (itemList!.itemListElement as unknown[]).length
  assert(
    rawCount > items.length,
    `fixture must contain duplicate urls for the dedupe assertion to mean anything ` +
      `(raw ${rawCount} vs deduped ${items.length})`,
  )

  for (const i of items) {
    assertStringIncludes(i.url, '/mega-events/')
    assert(i.name.length > 0, `every item carries a name: ${i.url}`)
  }
})

Deno.test('work list is empty rather than wrong when the ItemList is absent', () => {
  assertEquals(parseWorkList('<html><head></head><body>no ld</body></html>'), [])
  // A BreadcrumbList is an ItemList-shaped decoy on every detail page; it must
  // not be mistaken for the work list.
  assertEquals(parseWorkList(LAGOS), [])
})

// ─── detail: the merge, and the truncation trap ──────────────────────────────

Deno.test('detail parse merges Festival and Event blocks', () => {
  const r = parseEventLd(MASPALOMAS, MASP_URL, 'fallback name')
  assert(r.ok, 'maspalomas must parse')
  const e = r.event

  assertEquals(e.name, 'Maspalomas Fetish Pride 2026')
  assertEquals(e.start, '2026-10-01')
  assertEquals(e.end, '2026-10-12')
  assertEquals(e.city, 'Maspalomas')
  // `addressCountry` exists ONLY on the Festival block. If the merge regressed
  // to "last block wins" this is undefined, and a city with no country is the
  // shape that mis-linked 122 events to same-name cities.
  assertEquals(e.country, 'Spain')
  assertEquals(e.venueName, 'Yumbo Centre, Maspalomas, Gran Canaria')
  assertEquals(e.organizerName, 'Maspalomas Fetish Pride')
  assertEquals(e.organizerUrl, 'https://maspalomasfetishpride.com')
  assertEquals(e.ticketUrl, 'https://maspalomasfetishpride.com/')
  assertEquals(e.images, ['https://www.gayout.com/uploads/cities/maspalomas/cover.jpg'])
})

Deno.test('description takes the LONGEST candidate, never the first', () => {
  const r = parseEventLd(MASPALOMAS, MASP_URL, '')
  assert(r.ok)
  const d = r.event.description!

  // The Festival block's copy is cut mid-word; the Event block's is complete.
  // Publishing the truncated one is the 500-char mid-clause defect CLAUDE.md
  // records, so this asserts the full text won AND that the cut text lost.
  assertStringIncludes(d, 'Gran Canaria’s open-minded vibe makes it easy')
  assert(!d.endsWith('tribe-specifi'), 'must not publish the truncated variant')
  assert(d.length > 600, `expected the full three paragraphs, got ${d.length} chars`)

  const truncated = 'Darkrooms, gear nights, and tribe-specifi'
  const blocks = ldBlocks(MASPALOMAS)
  assert(
    blocks.some(b => typeof b.description === 'string' && (b.description as string).endsWith(truncated)),
    'fixture must still contain the truncated variant, or this test proves nothing',
  )
})

// ─── the three reasons a page yields nothing ─────────────────────────────────

Deno.test('a page with JSON-LD but no Event block is date-unannounced, not a parse failure', () => {
  // Pride in Lagos renders "Date TBA" and so carries breadcrumbs and videos but
  // no Event block. Classifying this as a regression would make a healthy run
  // look broken; classifying a real regression as this would hide it.
  const r = parseEventLd(LAGOS, LAGOS_URL, 'Pride in Lagos')
  assert(!r.ok)
  assertEquals(r.reason, 'no_event_ld')
  assert(ldBlocks(LAGOS).length > 0, 'fixture must have SOME ld+json or it tests the wrong branch')
})

Deno.test('a page with no JSON-LD at all is reported as a regression', () => {
  const r = parseEventLd('<html><body>blocked</body></html>', MASP_URL, 'name')
  assert(!r.ok)
  assertEquals(r.reason, 'no_ld')
})

Deno.test('an Event block with no start date is incomplete, and the name alone never stands in', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Some Pride',
    description: 'x'.repeat(50),
  })}</script>`
  const r = parseEventLd(html, MASP_URL, 'Listing Title')
  assert(!r.ok)
  assertEquals(r.reason, 'incomplete')
})

Deno.test('the listing title is used only when the Event block omits a name', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Event',
    startDate: '2027-06-01',
  })}</script>`
  const r = parseEventLd(html, MASP_URL, 'Listing Title')
  assert(r.ok)
  assertEquals(r.event.name, 'Listing Title')
})

Deno.test('a malformed JSON-LD block is skipped without losing the good ones', () => {
  const good = JSON.stringify({ '@type': 'Event', name: 'Real', startDate: '2027-06-01' })
  const html =
    `<script type="application/ld+json">{ not json ,,</script>` +
    `<script type="application/ld+json">${good}</script>`
  const r = parseEventLd(html, MASP_URL, '')
  assert(r.ok)
  assertEquals(r.event.name, 'Real')
})

// ─── dates ──────────────────────────────────────────────────────────────────

Deno.test('a naive local timestamp is reduced to its day rather than stamped UTC', () => {
  // The source states a day, not an instant. Appending `Z` would publish a
  // Sydney event as starting at 00:00 UTC, and the event contract rejects a
  // naive timestamp outright (E_START_TIMEZONE_MISSING).
  assertEquals(normalizeDate('2026-10-01'), '2026-10-01')
  assertEquals(normalizeDate('2026-10-01T18:00:00'), '2026-10-01')
  assertEquals(normalizeDate('2026-10-01T18:00:00+02:00'), '2026-10-01T18:00:00+02:00')
  assertEquals(normalizeDate('2026-10-01T18:00:00Z'), '2026-10-01T18:00:00Z')
  assertEquals(normalizeDate(''), undefined)
  assertEquals(normalizeDate(null), undefined)
  assertEquals(normalizeDate('not a date'), undefined)
})

Deno.test('every date this parser emits satisfies the event source contract shape', () => {
  // Mirrors validateEventSourceContract: a date must be YYYY-MM-DD or carry an
  // explicit offset. If normalizeDate ever returns anything else, staging would
  // accept a row that pipeline-validate then rejects.
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) || /(z|[+-]\d{2}:?\d{2})$/i.test(s)
  for (const input of ['2026-10-01', '2026-10-01T18:00:00', '2026-10-01T18:00:00+02:00', '2026-3-4']) {
    const out = normalizeDate(input)
    if (out !== undefined) assert(ok(out), `${input} -> ${out} violates the contract shape`)
  }
  const r = parseEventLd(MASPALOMAS, MASP_URL, '')
  assert(r.ok)
  assert(ok(r.event.start!))
  assert(ok(r.event.end!))
})

// ─── images ─────────────────────────────────────────────────────────────────

Deno.test('gayout default assets are treated as absence of an image', () => {
  assert(isPlaceholderImage('https://www.gayout.com/images/defaults/venue-fallback.svg'))
  assert(isPlaceholderImage('https://x.test/placeholder.png'))
  assert(isPlaceholderImage('https://x.test/default-event.jpg'))
  assert(!isPlaceholderImage('https://www.gayout.com/uploads/cities/maspalomas/cover.jpg'))
  // A stock photo is thin but it is what the source published — it is not a
  // placeholder and must survive, or real rows lose their only image.
  assert(!isPlaceholderImage('https://www.gayout.com/uploads/mega-events/x/pexels_94b73530a2.jpg'))

  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Event',
    name: 'X',
    startDate: '2027-01-01',
    image: [
      'https://www.gayout.com/images/defaults/venue-fallback.svg',
      'https://www.gayout.com/uploads/cities/x/cover.jpg',
    ],
  })}</script>`
  const r = parseEventLd(html, MASP_URL, '')
  assert(r.ok)
  assertEquals(r.event.images, ['https://www.gayout.com/uploads/cities/x/cover.jpg'])
})

// ─── classification ─────────────────────────────────────────────────────────

Deno.test('event_type comes from the source buckets, most specific first', () => {
  assertEquals(resolveEventType(['pride', 'leather']), 'fetish')
  assertEquals(resolveEventType(['pride']), 'pride')
  assertEquals(resolveEventType(['festival', 'party']), 'party')
  assertEquals(resolveEventType(['festival']), 'festival')
  // `bear` deliberately resolves to `other`: our vocabulary has no bear entry
  // and, sitting last, it only decides an event the source filed nowhere else.
  assertEquals(resolveEventType(['bear']), 'other')
  assertEquals(resolveEventType(['bear', 'pride']), 'pride')
  assertEquals(resolveEventType([]), 'other')
})

Deno.test('every bucket maps onto the events_event_type_check vocabulary', () => {
  // Drift guard: a value outside this list violates the CHECK at commit and the
  // whole batch fails, so the mapping may not quietly gain a new target.
  const allowed = new Set([
    'party', 'festival', 'pride', 'fetish', 'community', 'meetup', 'conference',
    'workshop', 'concert', 'film', 'drag', 'sports', 'art', 'theater',
    'fundraiser', 'protest', 'social', 'fair', 'cruise', 'comedy', 'exhibition',
    'other',
  ])
  assertEquals(TYPE_PRECEDENCE.length, 5)
  for (const [bucket, mapped] of TYPE_PRECEDENCE) {
    assert(allowed.has(mapped), `bucket ${bucket} maps to ${mapped}, not in events_event_type_check`)
  }
  assert(allowed.has(resolveEventType([])), 'the fallback must be a legal value')
})

// ─── identity + geo fallback ─────────────────────────────────────────────────

Deno.test('the source id is the url path, stable across host and trailing slash', () => {
  assertEquals(pathOf(MASP_URL), 'europe/spain/maspalomas/mega-events/maspalomas-fetish-pride')
  assertEquals(pathOf(`${MASP_URL}/`), 'europe/spain/maspalomas/mega-events/maspalomas-fetish-pride')
  assertEquals(pathOf('not a url'), 'not a url')
})

Deno.test('country falls back to the url path only for the mega-event shape', () => {
  assertEquals(countryFromPath('africa/ivory-coast/abidjan/mega-events/abidjan-pride'), 'Ivory Coast')
  assertEquals(countryFromPath('usa-canada/united-states/miami/mega-events/white-party-miami'), 'United States')
  // Not a mega-event path: guessing a country from an arbitrary path is the
  // name inference this adapter avoids.
  assertEquals(countryFromPath('europe/spain/maspalomas/bars'), undefined)
  assertEquals(countryFromPath(''), undefined)
})
