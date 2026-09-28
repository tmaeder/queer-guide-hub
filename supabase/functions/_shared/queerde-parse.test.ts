import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  berlinOffset, classifyEventType, decodeLatin1, normalizeDate, parsePage, pickCity, pickVenue,
} from './queerde-parse.ts'

// ────────────────────────────────────────────────────────────
// Fixtures are REAL `div.vevent` blocks captured from queer.de on 2026-09-28.
// All 498 vevents across both pages were parsed live to establish the
// distributions cited below (485 staged, 6 cancelled, 7 city-less).
//
// They are written here as ordinary UTF-8 source and encoded to LATIN-1 BYTES
// by `latin1`, because that is what the real pages serve. `parsePage` takes
// bytes precisely so this can be tested — see the charset note below.
// ────────────────────────────────────────────────────────────

/** UTF-8 source text → the ISO-8859-1 bytes queer.de actually serves. Every German codepoint is < 256. */
const latin1 = (s: string): Uint8Array => Uint8Array.from([...s].map((c) => c.charCodeAt(0)))

const SRC = 'https://www.queer.de/csd-termine.php'

/** Wrap vevent blocks in the minimum surrounding page. `archiveFrom` inserts queer.de's own divider. */
const page = (blocks: string[], archiveFrom = -1): string => {
  const parts = blocks.map((b, i) =>
    (i === archiveFrom ? '<a name="vergangen"> </a>' : '') + b
  )
  return `<html><body><p><b>Termine</b></p>${parts.join('<br>')}</body></html>`
}

// ── Live row, no venue, ", City, Bundesland" tail ──
const BRAMSCHE =
  '<div class="vevent"><span class="dtstart"><span class="value-title" title="2026-10-03" /></span>03.10.' +
  '<span class="location"><span class="value-title" title="Bramsche" /></span>, Bramsche, Niedersachsen<br>' +
  '<b><span class="summary">CSD Bramsche</span></b><br><span class="listelinksgrau">' +
  '<a href="https://qnbramsche.de" target="_blank" class="url eic"><i class="icon-link"></i></a> ' +
  '<a href="/events_ics.php?event_id=8160" class="noprintlinks eic grau" rel="nofollow"><i></i></a>' +
  '</span></div>'

// ── THE TAIL TRAP. location="Schleswig", tail=", Schleswig-Holstein" — one segment, and it is a STATE. ──
const SCHLESWIG =
  '<div class="vevent"><span class="dtstart"><span class="value-title" title="2026-06-27" /></span>27.06.2026' +
  '<span class="location"><span class="value-title" title="Schleswig" /></span>, Schleswig-Holstein<br>' +
  '<b><span class="summary">CSD Schleswig</span></b><br><span class="listelinksgrau">' +
  '<a href="https://slfl.de.tl/Termine.htm" target="_blank" class="url eic"><i></i></a></span></div>'

// ── City-state: tail is ", Berlin" only, and the venue is real. Date RANGE via dtend. ──
const HUSTLABALL =
  '<div class="vevent"><span class="dtstart"><span class="value-title" title="2026-10-15" /></span>15.10. bis ' +
  '<span class="dtend"><span class="value-title" title="2026-10-18" /></span>18.10.' +
  '<span class="location"><span class="value-title" title="Kit Kat Club, Berlin" /></span>, Berlin<br>' +
  '<b><span class="summary">Berlin: Hustlaball Weekend</span></b><br><span class="listelinksgrau">' +
  '<a href="https://www.hustlaball.de/" target="_blank" class="url eic"><i></i></a> ' +
  '<a href="/events_ics.php?event_id=7896" class="noprintlinks eic grau" rel="nofollow"><i></i></a>' +
  '</span></div>'

// ── "Diverse" is a placeholder for "various venues", not a venue. Umlaut city. ──
const GOETTINGEN =
  '<div class="vevent"><span class="dtstart"><span class="value-title" title="2026-10-09" /></span>09.10.' +
  '<span class="dtend"><span class="value-title" title="2026-11-01" /></span>01.11.' +
  '<span class="location"><span class="value-title" title="Diverse, Göttingen" /></span>, Göttingen, Niedersachsen<br>' +
  '<b><span class="summary">Göttingen: Queere Kulturtage</span></b><br><span class="listelinksgrau">' +
  '<a href="https://queeres-zentrum-goettingen.de/" target="_blank" class="url eic"><i></i></a>' +
  '</span></div>'

// ── A source cannot express cancellation, so this row is dropped. Note the <font> wrapper inside summary. ──
const WALTROP_CANCELLED =
  '<div class="vevent"><span class="dtstart"><span class="value-title" title="2024-09-21" /></span>21.09.2024' +
  '<span class="location"><span class="value-title" title="Moselbachpark, Waltrop" /></span>, Waltrop, Nordrhein-Westfalen<br>' +
  '<b><span class="summary"><font color=\'#808080\'>CSD Waltrop - abgesagt - </font></span></b><br>' +
  '<span class="listelinksgrau"><a href="https://csd-waltrop.jimdofree.com/" target="_blank" class="url eic"><i></i></a>' +
  '</span></div>'

// ── Nationwide observance, no single city, and no website link at all. ──
const TDOR =
  '<div class="vevent"><span class="dtstart"><span class="value-title" title="2025-11-20" /></span>20.11.2025' +
  '<span class="location"><span class="value-title" title="Diverse Orte" /></span>, Diverse Orte<br>' +
  '<b><span class="summary">Trans* Day of Remembrance</span></b><br>' +
  '<span class="listelinksgrau"></span></div>'

// ── The only shape carrying a TIME. Naive `T19:00` would trip E_START_TIMEZONE_MISSING. ──
const BENEFIZ =
  '<div class="vevent"><span class="dtstart"><span class="value-title" title="2026-06-29T19:00" /></span>29.06.2026' +
  '<span class="location"><span class="value-title" title="Theater des Westens, Berlin" /></span>, Berlin<br>' +
  '<b><span class="summary">Berlin: Benefizkonzert Gemeinsambunt</span></b><br><span class="listelinksgrau">' +
  '<a href="https://www.gemeinsambunt-konzert.de/" target="_blank" class="url eic"><i></i></a></span></div>'

// ── International page: the trailing segment is a German COUNTRY name, never a Bundesland. ──
const KUFSTEIN =
  '<div class="vevent"><span class="dtstart"><span class="value-title" title="2026-10-10" /></span>10.10.' +
  '<span class="location"><span class="value-title" title="Kufstein" /></span>, Kufstein, Österreich<br>' +
  '<b><span class="summary">CSD Kufstein</span></b><br><span class="listelinksgrau">' +
  '<a href="http://perlenpride.at/" target="_blank" class="url eic"><i></i></a> ' +
  '<a href="/events_ics.php?event_id=8012" class="noprintlinks eic grau" rel="nofollow"><i></i></a>' +
  '</span></div>'

// ── THE VENUE-AS-CITY ROW. The value-title is entirely a theatre and its stage;
// ── the city appears only in the tail. Real row, Karlsruhe.
const STAATSTHEATER =
  '<div class="vevent"><span class="dtstart"><span class="value-title" title="2026-03-14" /></span>14.03.2026' +
  '<span class="location"><span class="value-title" title="Badisches Staatstheater Karlsruhe, Kleines Haus" /></span>' +
  ', Karlsruhe, Baden-Württemberg<br>' +
  '<b><span class="summary">Karlsruhe: Pride Night – Nacht der Vielfalt</span></b><br>' +
  '<span class="listelinksgrau"><a href="https://www.staatstheater.karlsruhe.de/" target="_blank" class="url eic"><i></i></a>' +
  '</span></div>'

const one = (block: string, kind: 'de' | 'intl' = 'de') =>
  parsePage(latin1(page([block])), kind, SRC)

// ════════════════════════════════════════════════════════════
// 1. THE CHARSET. Neither page declares one and both are ISO-8859-1.
//
// Decoding as UTF-8 turns every umlaut into a replacement character, which
// reaches the database as a mangled city name — and on this corpus that is
// München, Köln, Göttingen, Nürnberg, Österreich and Zürich, i.e. most of the
// largest prides. Measured on the live page: the bytes for München are
// `M\xfcnchen`, a lone 0xFC that is not valid UTF-8 at all.
// ════════════════════════════════════════════════════════════
Deno.test('decodeLatin1 recovers umlauts that UTF-8 decoding destroys', () => {
  const bytes = latin1('München, Göttingen, Nürnberg, Österreich, Zürich, Straße')
  assertEquals(decodeLatin1(bytes), 'München, Göttingen, Nürnberg, Österreich, Zürich, Straße')
  // The control: the same bytes read as UTF-8 are corrupt, which is what this guards against.
  assertEquals(new TextDecoder('utf-8').decode(bytes).includes('�'), true)
})

Deno.test('parsePage carries umlauts through to city and title', () => {
  const { events } = one(GOETTINGEN)
  assertEquals(events.length, 1)
  assertEquals(events[0].city, 'Göttingen')
  assertEquals(events[0].title, 'Göttingen: Queere Kulturtage')
})

// ════════════════════════════════════════════════════════════
// 2. THE TAIL TRAP — the single worst bug found while building this.
//
// The text after the location span is ", City, Bundesland" on most rows but
// ", Bundesland" ALONE on others. `CSD Schleswig` has location="Schleswig" and
// tail ", Schleswig-Holstein", so a tail-derived city is "Schleswig-Holstein" —
// a federal state, not a place an event happens in. The city is the last
// comma-segment of the value-title; the tail only ever supplies the region.
// ════════════════════════════════════════════════════════════
Deno.test('a one-segment tail is the REGION, and the city still comes from the value-title', () => {
  const { events } = one(SCHLESWIG)
  assertEquals(events.length, 1)
  assertEquals(events[0].city, 'Schleswig')            // not 'Schleswig-Holstein'
  assertEquals(events[0].region, 'Schleswig-Holstein')
  assertEquals(events[0].countryCode, 'DE')
})

// ── City-states are legitimately both a city and a Bundesland, so region repeats the city. ──
Deno.test('a city-state row keeps its real venue and sets region to the city-state', () => {
  const { events } = one(HUSTLABALL)
  assertEquals(events[0].city, 'Berlin')
  assertEquals(events[0].region, 'Berlin')
  assertEquals(events[0].venueName, 'Kit Kat Club')
  assertEquals(events[0].start, '2026-10-15')
  assertEquals(events[0].end, '2026-10-18')
})

// ════════════════════════════════════════════════════════════
// 3. "Diverse" means "various venues in this city", not a venue.
//
// Staging it would feed a placeholder into venue matching, the same class of
// error as staging a city as a venue name (15 of 65 `name_exact` venue matches
// were cities or queer-village names — a 23% error rate on a branch that
// auto-applies).
// ════════════════════════════════════════════════════════════
Deno.test('the "Diverse" venue placeholder is nulled, and the city survives', () => {
  const { events } = one(GOETTINGEN)
  assertEquals(events[0].venueName, null)
  assertEquals(events[0].city, 'Göttingen')
})

// ── pickCity reads BOTH sources because each one alone is wrong on real rows. ──
Deno.test('pickCity prefers the tail when it names city AND region', () => {
  assertEquals(pickCity('Bramsche', ', Bramsche, Niedersachsen'), 'Bramsche')
  assertEquals(pickCity('Diverse, Göttingen', ', Göttingen, Niedersachsen'), 'Göttingen')
  // THE VENUE-AS-CITY BUG: the value-title is entirely a theatre here, so a
  // value-title-derived city would be "Kleines Haus" / "Theater Heidelberg".
  assertEquals(pickCity('Badisches Staatstheater Karlsruhe, Kleines Haus', ', Karlsruhe, Baden-Württemberg'), 'Karlsruhe')
  assertEquals(pickCity('Theater Heidelberg', ', Heidelberg, Baden-Württemberg'), 'Heidelberg')
})

Deno.test('pickCity falls back to the value-title when the tail is a single segment', () => {
  // A lone tail segment is a Bundesland (CSD Schleswig) or a city-state (Berlin),
  // never the city of a non-city-state — so the value-title has to supply it.
  assertEquals(pickCity('Schleswig', ', Schleswig-Holstein'), 'Schleswig')
  assertEquals(pickCity('Kit Kat Club, Berlin', ', Berlin'), 'Berlin')
  assertEquals(pickCity('Hamburg', ', Hamburg'), 'Hamburg')
  assertEquals(pickCity('', ''), null)
})

// End to end, because the unit tests above could both be right while parsePage
// still wires them together the wrong way round.
Deno.test('a venue-only value-title yields the tail city and the full venue, not a theatre as the city', () => {
  const e = one(STAATSTHEATER).events[0]
  assertEquals(e.city, 'Karlsruhe')                 // not 'Kleines Haus'
  assertEquals(e.venueName, 'Badisches Staatstheater Karlsruhe, Kleines Haus')
  assertEquals(e.region, 'Baden-Württemberg')
  assertEquals(e.countryCode, 'DE')
})

Deno.test('pickVenue drops only a TRAILING city segment, so a multi-part venue survives', () => {
  assertEquals(pickVenue('Kit Kat Club, Berlin', 'Berlin'), 'Kit Kat Club')
  assertEquals(pickVenue('Diverse, Göttingen', 'Göttingen'), null)          // placeholder
  assertEquals(pickVenue('Bramsche', 'Bramsche'), null)                     // value-title is just the city
  assertEquals(pickVenue('Ecke Lange Reihe, Kirchenallee, Hamburg', 'Hamburg'), 'Ecke Lange Reihe, Kirchenallee')
  // The city is NOT the last segment here, so nothing is stripped and the whole
  // theatre-plus-stage name is the venue.
  assertEquals(pickVenue('Badisches Staatstheater Karlsruhe, Kleines Haus', 'Karlsruhe'),
    'Badisches Staatstheater Karlsruhe, Kleines Haus')
  assertEquals(pickVenue('Theater Heidelberg', 'Heidelberg'), 'Theater Heidelberg')
  assertEquals(pickVenue('', 'Berlin'), null)
})

// ════════════════════════════════════════════════════════════
// 4. THE ARCHIVE DIVIDER. queer.de publishes past events on the same page,
// below `<a name="vergangen">`. 473 of the 498 rows sit there, so getting the
// split wrong misreports almost the whole corpus as upcoming.
// ════════════════════════════════════════════════════════════
Deno.test('rows after the vergangen anchor are flagged past, rows before it are not', () => {
  const { events } = parsePage(latin1(page([BRAMSCHE, HUSTLABALL, SCHLESWIG], 2)), 'de', SRC)
  assertEquals(events.map((e) => e.past), [false, false, true])
})

Deno.test('with no vergangen anchor nothing is past', () => {
  const { events } = parsePage(latin1(page([BRAMSCHE, HUSTLABALL])), 'de', SRC)
  assertEquals(events.map((e) => e.past), [false, false])
})

// ════════════════════════════════════════════════════════════
// 5. TIMEZONES. The contract accepts a bare `YYYY-MM-DD` or an explicit
// offset and NOTHING in between, so the naive `2026-06-29T19:00` that 3 of 498
// rows carry would raise E_START_TIMEZONE_MISSING and kill the row.
// ════════════════════════════════════════════════════════════
Deno.test('a naive datetime gains the real Europe/Berlin offset; a bare date is untouched', () => {
  assertEquals(normalizeDate('2026-10-03'), '2026-10-03')
  assertEquals(normalizeDate('2026-06-29T19:00'), '2026-06-29T19:00:00+02:00')  // CEST
  assertEquals(normalizeDate('2026-01-15T12:00'), '2026-01-15T12:00:00+01:00')  // CET
  assertEquals(normalizeDate(''), null)
  assertEquals(normalizeDate(null), null)
})

Deno.test('berlinOffset tracks DST rather than assuming one offset year-round', () => {
  assertEquals(berlinOffset('2026-01-15T12:00'), '+01:00')
  assertEquals(berlinOffset('2026-07-15T12:00'), '+02:00')
})

Deno.test('the timed row parses with an offset the event contract accepts', () => {
  const { events } = one(BENEFIZ)
  assertEquals(events[0].start, '2026-06-29T19:00:00+02:00')
  // A bare date and an offset-bearing datetime both satisfy the contract; a naive one does not.
  assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(events[0].start) || /[+-]\d{2}:\d{2}$/.test(events[0].start), true)
})

// ════════════════════════════════════════════════════════════
// 6. SKIPS ARE COUNTED, never silent.
//
// Cancelled: a source CANNOT express cancellation — `NormalizedItem` has no
// liveness field and `commit_event_staging_item` hardcodes status='active' —
// so staging one would publish a cancelled event as live.
// City-less: `pipeline-validate` raises E_NO_LOCATION on a row with no city,
// no venue and no geo, so it could never commit.
// ════════════════════════════════════════════════════════════
Deno.test('a cancelled row is dropped and counted, not staged', () => {
  const r = one(WALTROP_CANCELLED)
  assertEquals(r.events.length, 0)
  assertEquals(r.skipped.cancelled, 1)
})

Deno.test('a city-less "Diverse Orte" row is dropped and counted', () => {
  const r = one(TDOR)
  assertEquals(r.events.length, 0)
  assertEquals(r.skipped.noCity, 1)
})

Deno.test('a good row alongside two skipped ones still parses, and both skips are reported', () => {
  const r = parsePage(latin1(page([BRAMSCHE, WALTROP_CANCELLED, TDOR])), 'de', SRC)
  assertEquals(r.events.length, 1)
  assertEquals(r.events[0].title, 'CSD Bramsche')
  assertEquals(r.skipped, { cancelled: 1, noCity: 1, unknownRegion: 0, incomplete: 0 })
})

// ── An unrecognised trailing segment is refused rather than defaulted: committing an
// ── event to a guessed country is worse than not having it, and a rising count is how
// ── a country queer.de newly lists announces itself.
Deno.test('an unknown country on the international page is refused and counted', () => {
  const ESTONIA = KUFSTEIN.replace('Österreich', 'Estland')
  const r = parsePage(latin1(page([ESTONIA])), 'intl', SRC)
  assertEquals(r.events.length, 0)
  assertEquals(r.skipped.unknownRegion, 1)
})

// Both directions, because they fail differently. The German page fixes the
// country to DE, so accepting a segment that is NOT a Bundesland would stage a
// foreign event as German — a wrong country, which is worse than a missing row.
// (This case was added after a mutation that neutered the check survived the
// suite: the intl half was covered and the DE half was not.)
Deno.test('a non-Bundesland trailing segment on the German page is refused and counted', () => {
  const FOREIGN = BRAMSCHE.replace(', Bramsche, Niedersachsen', ', Bramsche, Österreich')
  const r = parsePage(latin1(page([FOREIGN])), 'de', SRC)
  assertEquals(r.events.length, 0)
  assertEquals(r.skipped.unknownRegion, 1)

  // And a missing tail is refused too, rather than defaulting to a null region.
  const NOTAIL = BRAMSCHE.replace(', Bramsche, Niedersachsen', ', Bramsche')
  assertEquals(parsePage(latin1(page([NOTAIL])), 'de', SRC).events.length, 0)
})

Deno.test('a Bundesland on the German page resolves to DE; a German country name resolves to its ISO2', () => {
  assertEquals(one(BRAMSCHE).events[0].countryCode, 'DE')
  const at = one(KUFSTEIN, 'intl').events[0]
  assertEquals(at.countryCode, 'AT')
  assertEquals(at.region, null)   // the intl page carries no Bundesland
  assertEquals(at.city, 'Kufstein')
})

// ════════════════════════════════════════════════════════════
// 7. IDENTITY. Live rows carry queer.de's own numeric id in the `.ics` link
// (25 of 25); archive rows carry none (0 of 473), so those need a synthetic key
// that is stable across runs or every weekly run re-stages the whole archive.
// ════════════════════════════════════════════════════════════
Deno.test('a live row uses queer.de own numeric event id', () => {
  assertEquals(one(BRAMSCHE).events[0].eventId, '8160')
  assertEquals(one(BRAMSCHE).events[0].sourceId, '8160')
  assertEquals(one(HUSTLABALL).events[0].sourceId, '7896')
})

Deno.test('an archive row with no ics link gets a stable readable synthetic id', () => {
  const e = one(SCHLESWIG).events[0]
  assertEquals(e.eventId, null)
  assertEquals(e.sourceId, 'past:2026-06-27:schleswig:csd-schleswig')
  // Stable: parsing the same row again yields the same key, which is what makes
  // the re-run skip rather than duplicate (uniqueness is on source_entity_id).
  assertEquals(one(SCHLESWIG).events[0].sourceId, e.sourceId)
})

Deno.test('a synthetic id transliterates umlauts rather than emitting non-ascii', () => {
  const MUC = SCHLESWIG
    .replace('title="Schleswig"', 'title="München"')
    .replace(', Schleswig-Holstein', ', Bayern')
    .replace('CSD Schleswig', 'München: Extra Pride')
  const e = one(MUC).events[0]
  assertEquals(e.city, 'München')
  assertEquals(e.sourceId, 'past:2026-06-27:muenchen:muenchen-extra-pride')
  assertEquals(/^[\x20-\x7e]+$/.test(e.sourceId), true)
})

// ════════════════════════════════════════════════════════════
// 8. event_type ORDER IS LOAD-BEARING.
//
// Karlsruhe's queer film festival is called "Pride Pictures" and Berlin's is
// "Porn Film Festival", so matching pride before film files both as parades.
// Pride runs before protest so a CSD — historically a demonstration — files as
// `pride`, leaving protest for marches and vigils that are not a CSD.
// ════════════════════════════════════════════════════════════
Deno.test('film beats pride, and pride beats protest', () => {
  assertEquals(classifyEventType('Karlsruhe: Pride Pictures'), 'film')
  assertEquals(classifyEventType('Berlin: Porn Film Festival'), 'film')
  assertEquals(classifyEventType('Regensburg: Queer-Streifen'), 'film')
  assertEquals(classifyEventType('CSD Bramsche'), 'pride')
  assertEquals(classifyEventType('Herbst Pride Norden'), 'pride')
  assertEquals(classifyEventType('Berlin: Dyke March'), 'protest')
  assertEquals(classifyEventType('Berlin: Kundgebung Straight Against Hate'), 'protest')
})

Deno.test('event_type covers the remaining shapes and defaults to other', () => {
  assertEquals(classifyEventType('Cardiff: Gay Games 2027'), 'sports')
  assertEquals(classifyEventType('Berlin: Hustlaball Weekend'), 'party')
  assertEquals(classifyEventType('Göttingen: Queere Kulturtage'), 'festival')
  assertEquals(classifyEventType('Berlin: Benefizkonzert Gemeinsambunt'), 'concert')
  assertEquals(classifyEventType('Etwas völlig Anderes'), 'other')
})

// ── Every event needs a non-empty `urls` or the contract raises
// ── E_SOURCE_URL_MISSING. 497 of 498 rows link a site; the source page is the
// ── honest fallback for the one that does not.
Deno.test('websites are collected, and the source page is the fallback when there are none', () => {
  assertEquals(one(HUSTLABALL).events[0].websites, ['https://www.hustlaball.de/'])
  const NOLINK = BRAMSCHE.replace(/<a href="https:\/\/qnbramsche\.de"[^>]*>.*?<\/a>/, '')
  assertEquals(one(NOLINK).events[0].websites, [SRC])
})

// ── The tail regex must anchor on the LOCATION span, not the earlier dtstart one.
// ── A date-range row puts a dtend span in between, which is the case that breaks a
// ── naive "text after the first </span>" read.
Deno.test('a date-range row still reads its region from the location tail', () => {
  const e = one(GOETTINGEN).events[0]
  assertEquals(e.start, '2026-10-09')
  assertEquals(e.end, '2026-11-01')
  assertEquals(e.region, 'Niedersachsen')
})
