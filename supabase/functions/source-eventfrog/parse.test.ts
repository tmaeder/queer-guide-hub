import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  decodeEntities, eventIdFromPath, eventTypeFromPath, extractTiles, normalizeOffset,
  parseEventPage, resolveCountry, timezoneForCountry, venueKey,
} from './parse.ts'

// eventfrog encodes SOME fields and not others: the same live event returned
// `Südpol` in location.name and `S&uuml;dpol` in organizer. Caught in the first
// dry run against prod.
Deno.test('decodeEntities handles the named accent families', () => {
  assertEquals(decodeEntities('S&uuml;dpol und Pride Zentralschweiz'), 'Südpol und Pride Zentralschweiz')
  assertEquals(decodeEntities('Gen&egrave;ve'), 'Genève')
  assertEquals(decodeEntities('N&uuml;rnberg &ndash; &Ouml;sterreich'), 'Nürnberg – Österreich')
  assertEquals(decodeEntities('Stra&szlig;e'), 'Straße')
  assertEquals(decodeEntities('DIE GRO&#7838;E PARTY'), 'DIE GROẞE PARTY')
  assertEquals(decodeEntities('Fish &amp; Chips'), 'Fish & Chips')
})

// Double-encoded input reaches the same output rather than a visible `&uuml;`.
Deno.test('decodeEntities unwinds a double-escaped entity', () => {
  assertEquals(decodeEntities('S&amp;uuml;dpol'), 'Südpol')
})

Deno.test('decodeEntities leaves an unknown entity alone rather than mangling it', () => {
  assertEquals(decodeEntities('a &notanentity; b'), 'a &notanentity; b')
})

const tile = (href: string, loc: string) =>
  `<a href="${href}" class="event-list__events__tile">
     <div class="event-list__events__tile__content__infos">
       <span class="event-list__events__tile__content__infos__title">T</span>
       <span class="event-list__events__tile__content__infos__location">${loc}</span>
     </div>
   </a>`

Deno.test('extractTiles reads the path and the listing ISO-2 suffix', () => {
  const html =
    tile('/de/p/partys/lgbtiq/explicit-sept-5th-7457503865702731783.html', 'Kauz, Z&uuml;rich (CH)') +
    tile('/de/p/partys/lgbtiq/supafly-gay-friends-clubbing-7484549944013006778.html', 'SUPAFLY, N&uuml;rnberg (DE)')
  const tiles = extractTiles(html)
  assertEquals(tiles.length, 2)
  assertEquals(tiles[0].countryCode, 'CH')
  assertEquals(tiles[1].countryCode, 'DE')
})

// The `--marked` modifier class and a `name="anchor-N"` attribute both sit on
// real tiles in the live listing; a tighter selector silently drops them.
Deno.test('extractTiles survives extra attributes and modifier classes', () => {
  const html =
    `<a href="/de/p/partys/lgbtiq/a-12345678901234567.html" name="anchor-1" class="event-list__events__tile">
       <span class="event-list__events__tile__content__infos__location">X, Bern (CH)</span></a>` +
    `<a href="/de/p/partys/lgbtiq/b-12345678901234568.html" class="event-list__events__tile event-list__events__tile--marked">
       <span class="event-list__events__tile__content__infos__location">Y, Wien (AT)</span></a>`
  assertEquals(extractTiles(html).map((t) => t.countryCode), ['CH', 'AT'])
})

Deno.test('extractTiles dedupes repeated links', () => {
  const one = tile('/de/p/partys/lgbtiq/a-12345678901234567.html', 'X, Bern (CH)')
  assertEquals(extractTiles(one + one).length, 1)
})

Deno.test('eventIdFromPath takes the numeric suffix, not the title slug', () => {
  assertEquals(eventIdFromPath('/de/p/partys/lgbtiq/explicit-sept-5th-7457503865702731783.html'), '7457503865702731783')
  assertEquals(eventIdFromPath('/de/p/partys/lgbtiq/no-id-here.html'), null)
})

Deno.test('eventTypeFromPath reads the site taxonomy, else null', () => {
  assertEquals(eventTypeFromPath('/de/p/partys/lgbtiq/x-12345678901234567.html'), 'party')
  assertEquals(eventTypeFromPath('/de/p/kurse-seminare/x-12345678901234567.html'), null)
})

// The load-bearing rule: "Bayern" is a German STATE sitting in addressCountry
// on a live row. It must not resolve to a country on its own, and it must not
// veto the listing's own "(DE)".
Deno.test('resolveCountry: a state in addressCountry falls through to the listing code', () => {
  assertEquals(resolveCountry('Bayern', 'DE'), 'DE')
  assertEquals(resolveCountry('Bayern', null), null)
})

Deno.test('resolveCountry accepts multilingual country names', () => {
  assertEquals(resolveCountry('Schweiz', 'CH'), 'CH')
  assertEquals(resolveCountry('Switzerland', 'CH'), 'CH')
  assertEquals(resolveCountry('Deutschland', null), 'DE')
  assertEquals(resolveCountry('Austria', 'AT'), 'AT')
})

Deno.test('resolveCountry returns null when the two signals disagree', () => {
  assertEquals(resolveCountry('Switzerland', 'DE'), null)
})

Deno.test('timezoneForCountry never guesses', () => {
  assertEquals(timezoneForCountry('CH'), 'Europe/Zurich')
  assertEquals(timezoneForCountry('AT'), 'Europe/Vienna')
  assertEquals(timezoneForCountry(null), null)
  assertEquals(timezoneForCountry('US'), null)
})

Deno.test('normalizeOffset turns +0200 into +02:00', () => {
  assertEquals(normalizeOffset('2026-09-05T22:00:00+0200'), '2026-09-05T22:00:00+02:00')
  assertEquals(normalizeOffset('2026-09-05T22:00:00+02:00'), '2026-09-05T22:00:00+02:00')
  assertEquals(normalizeOffset(''), null)
})

const PAGE = `<html><head>
<script type="application/ld+json">
[
  {
    "@context": "http://schema.org",
    "@type": "Event",
    "name": "EXPLICIT - Sept 5th",
    "startDate": "2026-09-05T22:00:00+0200",
    "endDate": "2026-09-06T06:00:00+0200",
    "eventStatus": "https://schema.org/EventScheduled",
    "location": {
      "@type": "Place",
      "name": "Kauz",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Ausstellungsstrasse 21",
        "addressLocality": "Z\\u00fcrich",
        "postalCode": "8005",
        "addressCountry": "Switzerland"
      }
    },
    "image": ["https://res.eventfrog.net/x.webp?_=1783478615000"],
    "description": "A sex-positive queer dance party.",
    "offers": [
      { "@type": "Offer", "price": "30.0", "priceCurrency": "CHF", "availability": "https://schema.org/SoldOut" },
      { "@type": "Offer", "price": "35.0", "priceCurrency": "CHF", "availability": "https://schema.org/InStock" }
    ],
    "organizer": { "@type": "Organization", "name": "Kauz" },
    "keywords": "Partys / LGBTIQ, Kauz, Z\\u00fcrich, 05.09.2026"
  },
  { "@type": "ImageObject", "contentUrl": "https://res.eventfrog.net/x.webp" }
]
</script></head><body></body></html>`

const PATH = '/de/p/partys/lgbtiq/explicit-sept-5th-7457503865702731783.html'

Deno.test('parseEventPage picks the Event out of the JSON-LD array', () => {
  const e = parseEventPage(PAGE, PATH, { path: PATH, countryCode: 'CH' })!
  assertEquals(e.id, '7457503865702731783')
  assertEquals(e.title, 'EXPLICIT - Sept 5th')
  assertEquals(e.start, '2026-09-05T22:00:00+02:00')
  assertEquals(e.end, '2026-09-06T06:00:00+02:00')
  assertEquals(e.eventType, 'party')
  assertEquals(e.organizer, 'Kauz')
  assertEquals(e.venue?.name, 'Kauz')
  assertEquals(e.venue?.city, 'Zürich')
  assertEquals(e.venue?.postal, '8005')
  assertEquals(e.venue?.country, 'CH')
  // cache-buster stripped so the same image does not re-stage as a change
  assertEquals(e.image, 'https://res.eventfrog.net/x.webp')
})

Deno.test('parseEventPage takes the cheapest offer and is not sold out while one is in stock', () => {
  const e = parseEventPage(PAGE, PATH, null)!
  assertEquals(e.price.min, 30)
  assertEquals(e.price.currency, 'CHF')
  assertEquals(e.price.soldOut, false)
})

Deno.test('parseEventPage returns null without an Event object', () => {
  assertEquals(parseEventPage('<html></html>', PATH, null), null)
  assertEquals(
    parseEventPage('<script type="application/ld+json">[{"@type":"Organization"}]</script>', PATH, null),
    null,
  )
})

// A title edit must not mint a second event, so identity is the numeric id —
// but a venue has no id anywhere on the site.
Deno.test('venueKey is name+city and cannot collide with an event id', () => {
  assertEquals(venueKey({ name: 'Kauz', street: null, postal: null, city: 'Zürich', country: 'CH' }), 'kauz|zuerich')
  assertEquals(venueKey({ name: 'Südpol', street: null, postal: null, city: 'Kriens', country: 'CH' }), 'suedpol|kriens')
})
