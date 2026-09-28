import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  parseCardDate, parseListing, parseDetail, cityConflicts, localityVocabulary,
  isPlaceholderDate, buildEvents, normToken, type G4uCard, type G4uDetail,
} from './gaytravel4u-parse.ts'

const NOW = new Date('2026-09-28T00:00:00Z')

// Real card markup from /gay-pride-calendar/, captured 2026-09-28.
const CARD_HTML = `
<article class='slide-entry flex_column post-entry post-entry-13748 slide-entry-overview slide-loop-1 slide-parity-odd av_one_third first real-thumbnail' itemscope="itemscope" itemtype="https://schema.org/CreativeWork" ><a href='https://www.gaytravel4u.com/event/curacao-pride/' data-rel='slide-3' class='slide-image' title=''><img decoding="async" width="495" height="370" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" class="wp-image-13749" alt="Cura&#231;ao Pride" data-lazy-src="https://www.gaytravel4u.com/wp-content/uploads/2016/08/Curacao-Pride-5-495x370.jpg" /></a><div class='slide-content'><header class="entry-content-header"><h3 class='slide-entry-title entry-title' itemprop="headline" ><a href='https://www.gaytravel4u.com/event/curacao-pride/' title='Cura&#231;ao Pride 2026'>Cura&#231;ao Pride 2026</a></h3></header><div style="border-bottom: 1px solid #e1e1e1;margin-bottom: 10px;padding-bottom: 5px;">From: Sep. 27.2026 - To: Oct. 03.2026</div><div class='slide-entry-excerpt entry-content' itemprop="text" >If you always dreamed of partying on the Caribbean Island of Curacao.<div class="read-more-link"><a href="#">Read more</a></div></div></div></article>
<article class='slide-entry flex_column post-entry post-entry-999 slide-loop-2' ><a href='https://www.gaytravel4u.com/event/beefcake-melbourne/' class='slide-image'></a><div class='slide-content'><header class="entry-content-header"><h3 class='slide-entry-title entry-title' itemprop="headline" ><a href='https://www.gaytravel4u.com/event/beefcake-melbourne/' title='Beefcake Melbourne'>Beefcake Melbourne</a></h3></header><div style="border-bottom: 1px solid #e1e1e1;">From: Awaiting dates - To: Awaiting dates</div></div></article>
`

// Real JSON-LD from /event/curacao-pride/.
const DETAIL_HTML = `<script type="application/ld+json" class="yoast-schema-graph">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},{"@type":"Event","@id":"https://www.gaytravel4u.com/event/curacao-pride/#event","name":"Cura\\u00e7ao Pride 2026","url":"https://www.gaytravel4u.com/event/curacao-pride/","startDate":"2026-09-27","endDate":"2026-10-03","description":"Curacao Gay Pride 2026 If you always dreamed of partying on a Caribbean Island, sipping your cocktail then Curacao Gay Pride is for you","image":"https://www.gaytravel4u.com/wp-content/uploads/2016/08/Curacao-Pride-5.jpg","location":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Curacao","addressCountry":"CW"}}}]}</script>`

Deno.test('g4u: parses the listing card', () => {
  const cards = parseListing(CARD_HTML)
  assertEquals(cards.length, 2)
  const c = cards[0]
  assertEquals(c.slug, 'curacao-pride')
  assertEquals(c.title, 'Curaçao Pride 2026')
  assertEquals(c.url, 'https://www.gaytravel4u.com/event/curacao-pride/')
  assertEquals(c.listStart, '2026-09-27')
  assertEquals(c.listEnd, '2026-10-03')
  assertEquals(c.image, 'https://www.gaytravel4u.com/wp-content/uploads/2016/08/Curacao-Pride-5-495x370.jpg')
  assertEquals(c.excerpt, 'If you always dreamed of partying on the Caribbean Island of Curacao.')
})

Deno.test('g4u: "Awaiting dates" is an absence, never a date', () => {
  assertEquals(parseListing(CARD_HTML)[1].listStart, null)
  assertEquals(parseCardDate('Awaiting dates'), null)
  assertEquals(parseCardDate(''), null)
  assertEquals(parseCardDate(null), null)
})

Deno.test('g4u: card date formats', () => {
  assertEquals(parseCardDate('Sep. 27.2026'), '2026-09-27')
  assertEquals(parseCardDate('Jan. 03.2027'), '2027-01-03')
  assertEquals(parseCardDate('Feb. 5.2027'), '2027-02-05')
  assertEquals(parseCardDate('Dec. 31.2026'), '2026-12-31')
  assertEquals(parseCardDate('Frob. 01.2026'), null)
})

Deno.test('g4u: the listing image prefers data-lazy-src over the SVG placeholder', () => {
  // The eager src is an inline SVG spacer; taking it would publish a blank image.
  const img = parseListing(CARD_HTML)[0].image!
  assertEquals(img.startsWith('https://'), true)
  assertEquals(img.includes('data:image'), false)
})

Deno.test('g4u: parses the Event node out of the Yoast @graph', () => {
  const d = parseDetail(DETAIL_HTML)
  assertEquals(d.start, '2026-09-27')
  assertEquals(d.end, '2026-10-03')
  assertEquals(d.city, 'Curacao')
  assertEquals(d.country, 'CW')
  assertEquals(d.image, 'https://www.gaytravel4u.com/wp-content/uploads/2016/08/Curacao-Pride-5.jpg')
  assertEquals(d.description?.startsWith('Curacao Gay Pride 2026'), true)
})

Deno.test('g4u: a page with no Event node yields all-nulls, not a throw', () => {
  const d = parseDetail('<script type="application/ld+json">{"@type":"WebPage"}</script>')
  assertEquals(d.start, null)
  assertEquals(d.city, null)
})

Deno.test('g4u: malformed JSON-LD does not abort the other blocks', () => {
  const d = parseDetail('<script type="application/ld+json">{not json</script>' + DETAIL_HTML)
  assertEquals(d.start, '2026-09-27')
})

// ---- guard 1: placeholder years ------------------------------------------

Deno.test('g4u: a date beyond the horizon is a placeholder', () => {
  // Live example: bilbao-in-black publishes 2031-06-12 on an annual event.
  assertEquals(isPlaceholderDate('2031-06-12', NOW), true)
  assertEquals(isPlaceholderDate('2031-07-24', NOW), true)
})

Deno.test('g4u: a legitimately distant announcement is NOT a placeholder', () => {
  // Cape Town Pride really is listed 17 months out; the bound must clear it.
  assertEquals(isPlaceholderDate('2027-02-05', NOW), false)
  assertEquals(isPlaceholderDate('2026-09-28', NOW), false)
  // Past events are kept: this corpus deliberately holds ~36.5k past events.
  assertEquals(isPlaceholderDate('2019-06-01', NOW), false)
})

Deno.test('g4u: an unparseable date is treated as a placeholder, not passed through', () => {
  assertEquals(isPlaceholderDate('not-a-date', NOW), true)
})

// ---- guard 2: locality naming a different city ---------------------------

const VOCAB = localityVocabulary([
  { city: 'New York' }, { city: 'Orlando' }, { city: 'Berlin' },
  { city: 'Washington' }, { city: 'Glasgow' }, { city: 'Curacao' },
])

Deno.test('g4u: a slug naming a DIFFERENT city is a conflict', () => {
  // The live defect: furball-orlando carries addressLocality "New York".
  assertEquals(cityConflicts('furball-orlando', 'New York', VOCAB), true)
})

Deno.test('g4u: a slug naming its OWN city is corroborated', () => {
  assertEquals(cityConflicts('curacao-pride', 'Curacao', VOCAB), false)
  assertEquals(cityConflicts('furball-orlando', 'Orlando', VOCAB), false)
})

Deno.test('g4u: SILENCE IS NOT A CONFLICT — the naive rule would strip correct cities', () => {
  // Measured: the "slug must contain the locality" rule flagged 3 of 26 and
  // all three were correct. These are those three.
  assertEquals(cityConflicts('easter-bear-dance', 'Berlin', VOCAB), false)
  assertEquals(cityConflicts('mid-atlantic-leather-weekend', 'Washington', VOCAB), false)
  assertEquals(cityConflicts('leathermen-scotland-leathery-weekend', 'Glasgow', VOCAB), false)
})

Deno.test('g4u: no city means nothing to contradict', () => {
  assertEquals(cityConflicts('furball-orlando', null, VOCAB), false)
})

Deno.test('g4u: the vocabulary ignores tokens too short to be discriminating', () => {
  const v = localityVocabulary([{ city: 'Ely' }, { city: 'Bath' }, { city: null }])
  assertEquals(v.has('ely'), false)
  assertEquals(v.has('bath'), true)
})

Deno.test('g4u: accents normalise on both sides', () => {
  assertEquals(normToken('Curaçao'), 'curacao')
  assertEquals(normToken('Zürich'), 'zurich')
  assertEquals(cityConflicts('curacao-pride', 'Curaçao', VOCAB), false)
})

// ---- build ---------------------------------------------------------------

function card(slug: string, over: Partial<G4uCard> = {}): G4uCard {
  return { slug, url: `https://www.gaytravel4u.com/event/${slug}/`, title: slug, listStart: null, listEnd: null, image: null, excerpt: null, ...over }
}
function detail(over: Partial<G4uDetail> = {}): G4uDetail {
  return { start: null, end: null, description: null, image: null, city: null, country: null, ...over }
}

Deno.test('g4u: detail wins, listing is the fallback', () => {
  const { events } = buildEvents([
    { card: card('a', { listStart: '2026-01-01' }), detail: detail({ start: '2026-02-02' }) },
    { card: card('b', { listStart: '2026-03-03' }), detail: detail() },
  ], NOW)
  assertEquals(events.map((e) => [e.slug, e.start]), [['a', '2026-02-02'], ['b', '2026-03-03']])
})

Deno.test('g4u: every drop is counted, never silent', () => {
  const { events, dropped } = buildEvents([
    { card: card('keep'), detail: detail({ start: '2026-10-01', city: 'Berlin' }) },
    { card: card('nodate'), detail: detail() },
    { card: card('placeholder'), detail: detail({ start: '2031-07-24' }) },
    { card: card('furball-orlando'), detail: detail({ start: '2026-11-01', city: 'New York', country: 'US' }) },
  ], NOW, ['Orlando'])
  assertEquals(dropped.noDate, 1)
  assertEquals(dropped.placeholder, 1)
  assertEquals(dropped.cityConflict, 1)
  // 4 in, 2 dropped outright. The conflicted row is KEPT — only its city is
  // withheld — so a city conflict costs a field, never the event.
  assertEquals(events.length, 2)
  assertEquals(events.map((e) => e.slug).sort(), ['furball-orlando', 'keep'])
})

Deno.test('g4u: the seeded vocabulary is what makes the guard survive a small batch', () => {
  // A late run stages a handful of slugs. Without a seed the batch contains
  // no Orlando event, so nothing can contradict "New York" — the guard would
  // silently stop working precisely when the corpus is nearly complete.
  const lone = [{ card: card('furball-orlando'), detail: detail({ start: '2026-11-01', city: 'New York', country: 'US' }) }]
  assertEquals(buildEvents(lone, NOW).dropped.cityConflict, 0)
  assertEquals(buildEvents(lone, NOW, ['Orlando']).dropped.cityConflict, 1)
})

Deno.test('g4u: the seed ignores tokens too short to discriminate', () => {
  const lone = [{ card: card('ely-pride'), detail: detail({ start: '2026-11-01', city: 'Bath' }) }]
  assertEquals(buildEvents(lone, NOW, ['Ely']).dropped.cityConflict, 0)
})

Deno.test('g4u: a contradicted city withholds the COUNTRY too', () => {
  const { events } = buildEvents([
    { card: card('furball-orlando'), detail: detail({ start: '2026-11-01', city: 'New York', country: 'US' }) },
    { card: card('orlando-bear-bash'), detail: detail({ start: '2026-11-01', city: 'Orlando', country: 'US' }) },
  ], NOW)
  const bad = events.find((e) => e.slug === 'furball-orlando')!
  assertEquals(bad.city, null)
  assertEquals(bad.country, null)
  assertEquals(bad.cityCorroborated, false)
  const good = events.find((e) => e.slug === 'orlando-bear-bash')!
  assertEquals(good.city, 'Orlando')
  assertEquals(good.country, 'US')
  assertEquals(good.cityCorroborated, true)
})

Deno.test('g4u: an end before its start is dropped, the event is kept', () => {
  const { events } = buildEvents([
    { card: card('x'), detail: detail({ start: '2026-10-05', end: '2026-10-01' }) },
  ], NOW)
  assertEquals(events[0].start, '2026-10-05')
  assertEquals(events[0].end, null)
})

Deno.test('g4u: event_type is inferred and on-vocabulary', () => {
  const LEGAL = new Set([
    'party', 'festival', 'pride', 'fetish', 'community', 'meetup', 'conference',
    'workshop', 'concert', 'film', 'drag', 'sports', 'art', 'theater',
    'fundraiser', 'protest', 'social', 'fair', 'cruise', 'comedy', 'exhibition', 'other',
  ])
  const { events } = buildEvents([
    { card: card('p', { title: 'Curaçao Pride 2026' }), detail: detail({ start: '2026-10-01' }) },
    { card: card('f', { title: 'Mates Leather Weekend' }), detail: detail({ start: '2026-10-01' }) },
  ], NOW)
  assertEquals(events[0].eventType, 'pride')
  assertEquals(events[1].eventType, 'fetish')
  for (const e of events) assertEquals(LEGAL.has(e.eventType), true)
})

Deno.test('g4u: end-to-end over the real card + real detail markup', () => {
  const cards = parseListing(CARD_HTML)
  const { events, dropped } = buildEvents([
    { card: cards[0], detail: parseDetail(DETAIL_HTML) },
    { card: cards[1], detail: parseDetail('<html></html>') },
  ], NOW)
  assertEquals(dropped.noDate, 1) // beefcake-melbourne is genuinely undated
  assertEquals(events.length, 1)
  assertEquals(events[0].slug, 'curacao-pride')
  assertEquals(events[0].city, 'Curacao')
  assertEquals(events[0].country, 'CW')
  assertEquals(events[0].eventType, 'pride')
})
