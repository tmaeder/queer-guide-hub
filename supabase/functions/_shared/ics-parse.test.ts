import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  unfold, unescapeText, parseMoment, parseComponents, parseIcs, decodeEntities, stripTags,
  parseLocation, firstUrl, htmlToText,
} from './ics-parse.ts'

// Every fixture below is a verbatim excerpt of the live rheinfetisch Google
// Calendar export, so these assertions are about shapes the feed really emits.

const ics = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`

// ------------------------------------------------------------
// Lexing
// ------------------------------------------------------------

Deno.test('unfold joins continuation lines folded with a space OR a tab', () => {
  assertEquals(unfold('DESCRIPTION:one\r\n two'), 'DESCRIPTION:onetwo')
  assertEquals(unfold('DESCRIPTION:one\r\n\ttwo'), 'DESCRIPTION:onetwo')
  // A genuine new property must NOT be joined onto the previous one.
  assertEquals(unfold('A:1\r\nB:2'), 'A:1\nB:2')
})

Deno.test('unescapeText resolves the backslash escape LAST', () => {
  assertEquals(unescapeText('Pullermanns\\, Mathiasstraße'), 'Pullermanns, Mathiasstraße')
  assertEquals(unescapeText('a\\nb'), 'a\nb')
  // The ordering trap: a literal backslash followed by n must survive as two
  // characters, not collapse into a newline.
  assertEquals(unescapeText('a\\\\nb'), 'a\\nb')
})

Deno.test('a colon inside a quoted parameter is not the value separator', () => {
  const [c] = parseComponents(ics(
    'BEGIN:VEVENT\r\nUID:u\r\nSUMMARY;X-ALT="a:b":Real Title\r\nDTSTART:20260101T100000Z\r\nEND:VEVENT',
  ))
  assertEquals(c.summary, 'Real Title')
})

// ------------------------------------------------------------
// Time
// ------------------------------------------------------------

Deno.test('parseMoment reads UTC, zoned and all-day values', () => {
  assertEquals(parseMoment('20260501T150000Z', {})!.iso, '2026-05-01T15:00:00.000Z')
  assertEquals(parseMoment('20261127', {})!.allDay, true)
  assertEquals(parseMoment('20261127', {})!.iso, '2026-11-27')
})

Deno.test('TZID wall-clock converts to the correct UTC instant across DST', () => {
  // Europe/Berlin is UTC+1 in January and UTC+2 in July. A Rheinfetisch Social
  // is always 19:00 local; the UTC instant must differ by season.
  assertEquals(parseMoment('20260114T190000', { TZID: 'Europe/Berlin' })!.iso, '2026-01-14T18:00:00.000Z')
  assertEquals(parseMoment('20260715T190000', { TZID: 'Europe/Berlin' })!.iso, '2026-07-15T17:00:00.000Z')
})

Deno.test('an instant inside the DST changeover hour is not off by an hour', () => {
  // 2026-03-29 02:00 Berlin is the spring-forward. 03:30 local that morning is
  // already CEST (+2), which only the second offset pass gets right.
  assertEquals(parseMoment('20260329T033000', { TZID: 'Europe/Berlin' })!.iso, '2026-03-29T01:30:00.000Z')
  // And the autumn boundary, where the naive pass overshoots the other way.
  assertEquals(parseMoment('20261025T033000', { TZID: 'Europe/Berlin' })!.iso, '2026-10-25T02:30:00.000Z')
})

Deno.test('a floating time is refused rather than given an invented zone', () => {
  assertEquals(parseMoment('20260114T190000', {}), null)
})

Deno.test('an unknown TZID falls through to refusal, not to a default zone', () => {
  assertEquals(parseMoment('20260114T190000', { TZID: 'Mars/Olympus' }), null)
})

// ------------------------------------------------------------
// The load-bearing rule: DAILY is a span
// ------------------------------------------------------------

Deno.test('FREQ=DAILY collapses to ONE span event, not one row per day', () => {
  // Verbatim: Folsom Europe 2026 runs 9-13 September as a daily repeat.
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:folsom@google.com\r\nSUMMARY:Folsom Europe\r\n' +
    'DTSTART;VALUE=DATE:20260909\r\nDTEND;VALUE=DATE:20260910\r\n' +
    'RRULE:FREQ=DAILY;UNTIL=20260913\r\nLOCATION:Berlin\\, Deutschland\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 1)
  assertEquals(events[0].origin, 'span')
  assertEquals(events[0].spanDays, 5)
  assertEquals(events[0].start.iso, '2026-09-09')
  // The LAST DAY, not the spec's exclusive next-day boundary: Folsom Europe
  // 2026 is the 9th to the 13th, and publishing the 14th makes every festival
  // read a day longer than it runs.
  assertEquals(events[0].end!.iso, '2026-09-13')
})

Deno.test('a 12-day daily festival is still one row', () => {
  // Maspalomas Fetish Pride: expanding literally would mint 12 rows each
  // titled for the whole pride but dated to one of its days.
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:masp@google.com\r\nSUMMARY:Maspalomas Fetish Pride\r\n' +
    'DTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261002\r\n' +
    'RRULE:FREQ=DAILY;UNTIL=20261012\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 1)
  assertEquals(events[0].spanDays, 12)
})

Deno.test('FREQ=DAILY;COUNT=n spans n days', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:csd@google.com\r\nSUMMARY:CSD Köln\r\n' +
    'DTSTART;VALUE=DATE:20250704\r\nDTEND;VALUE=DATE:20250705\r\n' +
    'RRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 1)
  assertEquals(events[0].spanDays, 3)
  assertEquals(events[0].start.iso, '2025-07-04')
  assertEquals(events[0].end!.iso, '2025-07-06')
})

// ------------------------------------------------------------
// All-day DTEND is EXCLUSIVE in the spec and INCLUSIVE in this corpus
// ------------------------------------------------------------

Deno.test('a one-day all-day event ends on its own day, not the next one', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:one@google.com\r\nSUMMARY:Bewerbungsfrist\r\n' +
    'DTSTART;VALUE=DATE:20261127\r\nDTEND;VALUE=DATE:20261128\r\nEND:VEVENT',
  ))
  assertEquals(events[0].start.iso, '2026-11-27')
  assertEquals(events[0].end!.iso, '2026-11-27')
})

Deno.test('a timed end is left alone — a clock time is already the real finish', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:t@google.com\r\nSUMMARY:Dinner\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260925T190000\r\n' +
    'DTEND;TZID=Europe/Berlin:20260925T230000\r\nEND:VEVENT',
  ))
  assertEquals(events[0].end!.iso, '2026-09-25T21:00:00.000Z')
})

Deno.test('a zero-length all-day DTEND does not reverse the range', () => {
  // Some producers write DTEND equal to DTSTART instead of the next day.
  // Subtracting blindly would end the event before it starts.
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:z@google.com\r\nSUMMARY:Odd\r\n' +
    'DTSTART;VALUE=DATE:20261127\r\nDTEND;VALUE=DATE:20261127\r\nEND:VEVENT',
  ))
  assertEquals(events[0].end!.iso, '2026-11-27')
  assert(events[0].end!.iso >= events[0].start.iso)
})

Deno.test('the inclusive end matches what the corpus already stores for Maspalomas', () => {
  // patroc holds `Maspalomas Fetish Pride 2026` as 2026-10-01 -> 2026-10-12.
  // The feed expresses the same twelve days as a daily rule; the two must agree
  // or dedup sees two festivals a day apart instead of one.
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:m@google.com\r\nSUMMARY:Maspalomas Fetish Pride\r\n' +
    'DTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261002\r\n' +
    'RRULE:FREQ=DAILY;UNTIL=20261012\r\nEND:VEVENT',
  ))
  assertEquals(events[0].start.iso, '2026-10-01')
  assertEquals(events[0].end!.iso, '2026-10-12')
})

Deno.test('a timed daily span keeps the last day’s clock time as its end', () => {
  // Fetisch-Netzwerk NRW Stand: 12:00 each day of the CSD weekend. The span
  // genuinely runs from Saturday noon to Sunday evening.
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:stand@google.com\r\nSUMMARY:Fetisch-Netzwerk NRW Stand\r\n' +
    'DTSTART;TZID=Europe/Berlin:20250621T120000\r\nDTEND;TZID=Europe/Berlin:20250621T190000\r\n' +
    'RRULE:FREQ=DAILY;COUNT=2\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 1)
  assertEquals(events[0].start.iso, '2025-06-21T10:00:00.000Z')
  assertEquals(events[0].end!.iso, '2025-06-22T17:00:00.000Z')
})

// ------------------------------------------------------------
// MONTHLY genuinely expands
// ------------------------------------------------------------

Deno.test('FREQ=MONTHLY;BYDAY=2WE expands to the second Wednesday of each month', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:social@google.com\r\nSUMMARY:Rheinfetisch Social\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260114T190000\r\nDTEND;TZID=Europe/Berlin:20260114T230000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=12;BYDAY=2WE\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 12)
  assertEquals(events[0].start.iso.slice(0, 10), '2026-01-14')
  assertEquals(events[1].start.iso.slice(0, 10), '2026-02-11')
  assertEquals(events[2].start.iso.slice(0, 10), '2026-03-11')
  // Every instance is its own row with its own stable key.
  assertEquals(events[0].instanceKey, 'social@google.com::20260114')
  assert(events.every((e) => e.origin === 'instance'))
})

Deno.test('INTERVAL=3 yields a quarterly series', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:cc@google.com\r\nSUMMARY:COLOURcode\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260227T220000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=4;INTERVAL=3;BYDAY=4FR\r\nEND:VEVENT',
  ))
  assertEquals(events.map((e) => e.start.iso.slice(0, 10)), [
    '2026-02-27', '2026-05-22', '2026-08-28', '2026-11-27',
  ])
})

Deno.test('a negative BYDAY counts back from the end of the month', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:last@google.com\r\nSUMMARY:Last Friday\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260130T200000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=-1FR\r\nEND:VEVENT',
  ))
  assertEquals(events.map((e) => e.start.iso.slice(0, 10)), [
    '2026-01-30', '2026-02-27', '2026-03-27',
  ])
})

// ------------------------------------------------------------
// Overrides and exclusions
// ------------------------------------------------------------

Deno.test('RECURRENCE-ID replaces the generated instance rather than joining it', () => {
  // The real series: the February social moved a week earlier.
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:s@google.com\r\nSUMMARY:Rheinfetisch Social\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260114T190000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=2WE\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nUID:s@google.com\r\nSUMMARY:Rheinfetisch Social\r\n' +
    'RECURRENCE-ID;TZID=Europe/Berlin:20260211T190000\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260204T190000\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 3)
  const days = events.map((e) => e.start.iso.slice(0, 10))
  // The moved date is present ONCE and the generated 02-11 is gone.
  assert(days.includes('2026-02-04'))
  assert(!days.includes('2026-02-11'))
  assertEquals(events.find((e) => e.origin === 'override')!.start.iso.slice(0, 10), '2026-02-04')
})

Deno.test('an override may retitle its instance', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:s2@google.com\r\nSUMMARY:Rheinfetisch Social\r\n' +
    'DTSTART;TZID=Europe/Berlin:20261209T190000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=1;BYDAY=2WE\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nUID:s2@google.com\r\nSUMMARY:Rheinfetisch Weihnachts–Social\r\n' +
    'RECURRENCE-ID;TZID=Europe/Berlin:20261209T190000\r\n' +
    'DTSTART;TZID=Europe/Berlin:20261209T190000\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 1)
  assertEquals(events[0].summary, 'Rheinfetisch Weihnachts–Social')
})

Deno.test('EXDATE removes the cancelled occurrences', () => {
  // COLOURcode 2026: four quarterly slots, three struck out.
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:cc2@google.com\r\nSUMMARY:COLOURcode\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260227T220000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=4;INTERVAL=3;BYDAY=4FR\r\n' +
    'EXDATE;TZID=Europe/Berlin:20260522T220000\r\n' +
    'EXDATE;TZID=Europe/Berlin:20260828T220000\r\n' +
    'EXDATE;TZID=Europe/Berlin:20261127T220000\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 1)
  assertEquals(events[0].start.iso.slice(0, 10), '2026-02-27')
})

Deno.test('a comma-separated EXDATE line excludes every date it lists', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:cc3@google.com\r\nSUMMARY:COLOURcode\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260227T220000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=4;INTERVAL=3;BYDAY=4FR\r\n' +
    'EXDATE;TZID=Europe/Berlin:20260522T220000,20260828T220000\r\nEND:VEVENT',
  ))
  assertEquals(events.map((e) => e.start.iso.slice(0, 10)), ['2026-02-27', '2026-11-27'])
})

Deno.test('an override with no master in the window is still emitted', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:orphan@google.com\r\nSUMMARY:Moved Social\r\n' +
    'RECURRENCE-ID;TZID=Europe/Berlin:20250611T190000\r\n' +
    'DTSTART;TZID=Europe/Berlin:20250618T190000\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 1)
  assertEquals(events[0].origin, 'override')
})

Deno.test('a CANCELLED occurrence is dropped', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:x@google.com\r\nSUMMARY:Gone\r\nSTATUS:CANCELLED\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260114T190000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=2;BYDAY=2WE\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 0)
})

// ------------------------------------------------------------
// Bounds
// ------------------------------------------------------------

Deno.test('an unbounded RRULE yields the seed only and cannot hang the run', () => {
  // No COUNT and no UNTIL is infinite by definition.
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:inf@google.com\r\nSUMMARY:Forever\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260114T190000\r\nRRULE:FREQ=MONTHLY;BYDAY=2WE\r\nEND:VEVENT',
  ))
  assertEquals(events.length, 1)
})

Deno.test('an unimplemented FREQ is REPORTED, and its seed date is still kept', () => {
  const { events, unsupported } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:w@google.com\r\nSUMMARY:Weekly thing\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260114T190000\r\nRRULE:FREQ=WEEKLY;COUNT=5\r\nEND:VEVENT',
  ))
  assertEquals(unsupported.length, 1)
  assertEquals(unsupported[0].uid, 'w@google.com')
  assert(unsupported[0].reason.includes('WEEKLY'))
  // Silence would lose a real date while reporting nothing actionable.
  assertEquals(events.length, 1)
})

Deno.test('a VEVENT with no parsable DTSTART is skipped, not emitted undated', () => {
  const comps = parseComponents(ics(
    'BEGIN:VEVENT\r\nUID:nd@google.com\r\nSUMMARY:No date\r\nEND:VEVENT',
  ))
  assertEquals(comps.length, 0)
})

// ------------------------------------------------------------
// LOCATION
// ------------------------------------------------------------

Deno.test('a full four-part address splits into venue/street/postal/city/country', () => {
  assertEquals(parseLocation('Pullermanns, Mathiasstraße 22, 50676 Köln, Deutschland'), {
    venueName: 'Pullermanns',
    address: 'Mathiasstraße 22',
    postalCode: '50676',
    city: 'Köln',
    countryCode: 'DE',
  })
})

Deno.test('a venue name may itself contain a hyphenated city', () => {
  const l = parseLocation('Amadeus - Köln, Vor St. Martin 8, 50667 Köln, Deutschland')
  assertEquals(l.venueName, 'Amadeus - Köln')
  assertEquals(l.address, 'Vor St. Martin 8')
  assertEquals(l.city, 'Köln')
})

Deno.test('a bare city and country yields no venue name', () => {
  assertEquals(parseLocation('Köln, Deutschland'), { city: 'Köln', countryCode: 'DE' })
})

Deno.test('a leftover segment equal to the city is NOT published as a venue', () => {
  // `Bremen, 28 Bremen, Deutschland` would otherwise mint a venue named
  // "Bremen" — the place-name collision link_event_venues already measures at
  // a 23% error rate on its name-match branch.
  const l = parseLocation('Bremen, 28 Bremen, Deutschland')
  assertEquals(l.venueName, undefined)
  assertEquals(l.city, 'Bremen')
  assertEquals(l.countryCode, 'DE')
})

Deno.test('the same guard holds for Stuttgart, the feed’s other instance', () => {
  assertEquals(parseLocation('Stuttgart, 70 Stuttgart, Deutschland').venueName, undefined)
})

Deno.test('a partial postcode is dropped but its city is kept', () => {
  // "28 Bremen" is a truncated PLZ; storing 28 as a postcode would be wrong.
  assertEquals(parseLocation('Bremen, 28 Bremen, Deutschland').postalCode, undefined)
  assertEquals(parseLocation('X, 50676 Köln, Deutschland').postalCode, '50676')
})

Deno.test('a Spanish province between town and country is not taken as the city', () => {
  // Verbatim from the feed. Reading `Las Palmas` as the city puts a Maspalomas
  // event in a real city 50 km away, and silently drops the postcode.
  assertEquals(
    parseLocation('Yumbo Centrum, Av. Estados Unidos, 54, 35100 Maspalomas, Las Palmas, Spanien'),
    {
      venueName: 'Yumbo Centrum',
      address: 'Av. Estados Unidos, 54',
      postalCode: '35100',
      city: 'Maspalomas',
      countryCode: 'ES',
    },
  )
})

Deno.test('the German shape, where the postcode IS the last segment, is untouched', () => {
  // The province rule must not fire here, or every ordinary address loses its city.
  assertEquals(parseLocation('Pullermanns, Mathiasstraße 22, 50676 Köln, Deutschland').city, 'Köln')
  assertEquals(parseLocation('Dreizehn, Welserstraße 27, 10777 Berlin, Deutschland').city, 'Berlin')
  assertEquals(parseLocation('Bremen, 28 Bremen, Deutschland').city, 'Bremen')
  assertEquals(parseLocation('Köln, Deutschland').city, 'Köln')
})

Deno.test('with no postcode anywhere the trailing segment is still the city', () => {
  assertEquals(parseLocation('Woof Berlin, Fuggerstraße 37, Berlin, Deutschland').city, 'Berlin')
})

Deno.test('non-German countries resolve', () => {
  assertEquals(parseLocation('Waagnatie Expo & Events, Rijnkaai 150, 2000 Antwerpen, België').countryCode, 'BE')
  assertEquals(parseLocation('Wien, Österreich').countryCode, 'AT')
  assertEquals(parseLocation('Yumbo Centrum, Av. Estados Unidos 54, 35100 Maspalomas, Spanien').countryCode, 'ES')
})

Deno.test('an unstructured single segment is a venue hint, never a city claim', () => {
  const l = parseLocation('Köln Grüngürtel')
  assertEquals(l.venueName, 'Köln Grüngürtel')
  assertEquals(l.city, undefined)
})

Deno.test('an empty or missing LOCATION yields nothing rather than an empty venue', () => {
  assertEquals(parseLocation(undefined), {})
  assertEquals(parseLocation('   '), {})
})

// ------------------------------------------------------------
// DESCRIPTION
// ------------------------------------------------------------

Deno.test('htmlToText keeps the line breaks that carry the structure', () => {
  const out = htmlToText('Einmal im Quartal<br><br>8€ Mindestverzehr<br>Men only')
  assertEquals(out, 'Einmal im Quartal\n\n8€ Mindestverzehr\nMen only')
})

Deno.test('htmlToText strips tags and decodes the entities the feed uses', () => {
  assertEquals(htmlToText('<b>Meet &amp; Greet</b>&nbsp;heute'), 'Meet & Greet heute')
})

Deno.test('entities decode in ONE pass — &amp;lt; stays the literal &lt;', () => {
  // The double-unescape class: chained replaces resolve &amp; to & and then
  // re-read `lt;`, so an author's literal &lt; silently becomes a real `<`.
  assertEquals(decodeEntities('&amp;lt;'), '&lt;')
  assertEquals(decodeEntities('&amp;'), '&')
  assertEquals(decodeEntities('Meet &amp; Greet'), 'Meet & Greet')
  assertEquals(decodeEntities('&lt;b&gt;'), '<b>')
})

Deno.test('an unrecognised entity is left exactly as written', () => {
  assertEquals(decodeEntities('&bogus; &notreal;'), '&bogus; &notreal;')
  // A bare ampersand is not an entity and must not be touched.
  assertEquals(decodeEntities('R&D 5 & 6'), 'R&D 5 & 6')
})

Deno.test('numeric entities decode, and an out-of-range one does not throw', () => {
  assertEquals(decodeEntities('&#39;'), "'")
  assertEquals(decodeEntities('&#x27;'), "'")
  assertEquals(decodeEntities('&#x1F3F3;'), '\u{1F3F3}')
  assertEquals(decodeEntities('&#9999999999;'), '&#9999999999;')
})

/**
 * The invariant is that NO `<...>` PAIR SURVIVES — not that no angle bracket
 * does. `5 < 6` is ordinary prose and has to come through untouched, so a
 * blanket bracket ban would be wrong in the common case while looking stricter.
 */
const hasTag = (s: string) => /<[^>]*>/.test(s)

Deno.test('stripTags leaves no tag behind, including one spliced by its own removal', () => {
  // Incomplete sanitization: a pass over `<<script>script>` deletes an inner
  // match and can splice the remainder into a fresh tag behind the cursor.
  assert(!hasTag(stripTags('<<script>script>alert(1)')))
  assert(!hasTag(stripTags('<<b>b>text')))
  assert(!hasTag(stripTags('<scr<script>ipt>x')))
})

Deno.test('an ESCAPED less-than survives; a RAW one is consumed as markup', () => {
  // This is why entities decode AFTER stripping: `&lt;` is invisible to the
  // stripper and comes through intact. Google encodes prose angle brackets, so
  // this is the form the real feed uses.
  assertEquals(htmlToText('<b>5 &lt; 6</b>'), '5 < 6')
  assertEquals(htmlToText('Preis &lt; 10&euro;'), 'Preis < 10&euro;')

  // The limitation, asserted so it is a known shape rather than a surprise: any
  // `<` followed later by a `>` IS a tag match, so a raw one eats the text
  // between. Regex extraction cannot separate that from real markup. The
  // contract is only that it degrades to inert text, never to a tag.
  const raw = htmlToText('<b>5 < 6</b>')
  assert(!hasTag(raw ?? ''), `produced a tag: ${raw}`)
})

Deno.test('stripTags terminates on adversarial nesting', () => {
  const nested = '<'.repeat(40) + 'script' + '>'.repeat(40)
  const out = stripTags(nested)
  assert(!hasTag(out), `left a tag: ${out}`)
})

Deno.test('htmlToText cannot reconstitute a tag from escaped source', () => {
  // Tags are stripped BEFORE entities decode, so this stays inert text.
  const out = htmlToText('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;')!
  assert(!out.includes('<script'), `produced a tag: ${out}`)
  assertEquals(out, '&lt;script&gt;alert(1)&lt;/script&gt;')
})

Deno.test('htmlToText strips a real tag and keeps deliberately escaped text', () => {
  assertEquals(htmlToText('<b>bold</b> and &lt;not a tag&gt;'), 'bold and <not a tag>')
})

Deno.test('firstUrl prefers an href and rejects a non-http scheme', () => {
  assertEquals(
    firstUrl('<a href="https://nlc-nuernberg.de/programm/">link</a>'),
    'https://nlc-nuernberg.de/programm/',
  )
  assertEquals(firstUrl('mail us at javascript:alert(1)'), undefined)
  assertEquals(firstUrl('no link here'), undefined)
})

// ------------------------------------------------------------
// Keys
// ------------------------------------------------------------

Deno.test('instance keys are stable across two reads of the same calendar', () => {
  const doc = ics(
    'BEGIN:VEVENT\r\nUID:k@google.com\r\nSUMMARY:S\r\n' +
    'DTSTART;TZID=Europe/Berlin:20260114T190000\r\n' +
    'RRULE:FREQ=MONTHLY;COUNT=4;BYDAY=2WE\r\nEND:VEVENT',
  )
  assertEquals(
    parseIcs(doc).events.map((e) => e.instanceKey),
    parseIcs(doc).events.map((e) => e.instanceKey),
  )
})

Deno.test('a span and a single both key on the bare UID', () => {
  const span = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:sp@google.com\r\nSUMMARY:Fest\r\nDTSTART;VALUE=DATE:20260909\r\n' +
    'RRULE:FREQ=DAILY;UNTIL=20260911\r\nEND:VEVENT',
  )).events[0]
  assertEquals(span.instanceKey, 'sp@google.com')

  const single = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:si@google.com\r\nSUMMARY:One\r\nDTSTART:20260909T100000Z\r\nEND:VEVENT',
  )).events[0]
  assertEquals(single.instanceKey, 'si@google.com')
})

Deno.test('events come back sorted by start', () => {
  const { events } = parseIcs(ics(
    'BEGIN:VEVENT\r\nUID:b@google.com\r\nSUMMARY:B\r\nDTSTART:20261201T100000Z\r\nEND:VEVENT\r\n' +
    'BEGIN:VEVENT\r\nUID:a@google.com\r\nSUMMARY:A\r\nDTSTART:20260101T100000Z\r\nEND:VEVENT',
  ))
  assertEquals(events.map((e) => e.summary), ['A', 'B'])
})

// A German borough is glued to the city rather than being its own comma
// segment, so segmentation alone cannot reach it. Both live rows that landed
// with a NULL city_id had this shape.
Deno.test('parseLocation: strips a Berlin borough suffix, with and without a postcode', () => {
  const withPostcode = parseLocation(
    'Dreizehn, Welserstraße 27, 10777 Berlin-Bezirk Tempelhof-Schöneberg, Deutschland',
  )
  assertEquals(withPostcode.city, 'Berlin')
  assertEquals(withPostcode.postalCode, '10777')
  assertEquals(withPostcode.venueName, 'Dreizehn')

  // The no-postcode path assigns the city from a different branch, so it needs
  // its own case — a fix applied to only one branch passes the other.
  const noPostcode = parseLocation('Fuggerstraße, Berlin-Bezirk Tempelhof-Schöneberg, Deutschland')
  assertEquals(noPostcode.city, 'Berlin')

  // With only city + country, parseLocation returns through an earlier branch.
  // Keep that third assignment site under the same normalization contract.
  const cityOnly = parseLocation('Berlin-Bezirk Tempelhof-Schöneberg, Deutschland')
  assertEquals(cityOnly.city, 'Berlin')
})

Deno.test('parseLocation: a hyphenated city name survives intact', () => {
  // The reason the rule is anchored on the literal `-Bezirk ` marker: a generic
  // hyphen split would truncate every one of these.
  // Three segments, matching the real shape: a 2-segment address takes the
  // lone-segment branch, which does not split the postcode at all.
  assertEquals(parseLocation('Kurhaus, 76530 Baden-Baden, Deutschland').city, 'Baden-Baden')
  assertEquals(parseLocation('Europaplatz, 44575 Castrop-Rauxel, Deutschland').city, 'Castrop-Rauxel')
  // A district name that is itself hyphenated must not survive as the city.
  assertEquals(
    parseLocation('Welserstraße 27, 10777 Berlin-Bezirk Tempelhof-Schöneberg, Deutschland').city,
    'Berlin',
  )
})
