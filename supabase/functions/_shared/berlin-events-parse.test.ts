// cd supabase/functions && deno test --allow-env _shared/berlin-events-parse.test.ts
//
// Every fixture below is a verbatim excerpt of a real page fetched on
// 2026-08-22 — the whitespace, the stray tabs and the unescaped `&` inside
// data-badge are the point, so do not tidy them.

import { assertEquals } from 'jsr:@std/assert'
import {
  BERLIN,
  berlinIso,
  inferEventType,
  inferEventTypeLayered,
  parseBkaSpielplan,
  parseBoeseBubenList,
  parseLabOratory,
  parseSiegessaeuleDay,
  parseSiegessaeuleDetail,
  parseTicketcornerSubEvents,
} from './berlin-events-parse.ts'

// ---------------------------------------------------------------- berlinIso

Deno.test('berlinIso: resolves CEST and CET on both sides of each switch', () => {
  // 2026 autumn switch is 25 Oct; 2027 spring switch is 28 Mar.
  assertEquals(berlinIso('2026-10-24', '20:00'), '2026-10-24T20:00:00+02:00')
  assertEquals(berlinIso('2026-10-25', '20:00'), '2026-10-25T20:00:00+01:00')
  assertEquals(berlinIso('2027-03-27', '20:00'), '2027-03-27T20:00:00+01:00')
  assertEquals(berlinIso('2027-03-28', '20:00'), '2027-03-28T20:00:00+02:00')
})

Deno.test('berlinIso: rolls an after-midnight hour into the next day', () => {
  // German listings write a 00:30 start as 24:30. Postgres accepts 24:00 as
  // end-of-day but REJECTS 24:30, so this must roll rather than pass through.
  assertEquals(berlinIso('2026-10-01', '24:30'), '2026-10-02T00:30:00+02:00')
  assertEquals(berlinIso('2026-10-01', '25:00'), '2026-10-02T01:00:00+02:00')
})

Deno.test('berlinIso: returns null rather than guessing on bad input', () => {
  // A null start makes commit_event_staging_item RAISE, which is loud. A
  // wrong start is silent, which is worse.
  // Shape-matching is not validation: Date.UTC rolls 2026-13-99 over into a
  // real-looking 2027 date instead of rejecting it.
  assertEquals(berlinIso('2026-13-99', '20:00'), null)
  assertEquals(berlinIso('2026-02-30', '20:00'), null)
  assertEquals(berlinIso('not-a-date', '20:00'), null)
  assertEquals(berlinIso('2026-10-01', '99:00'), null)
  assertEquals(berlinIso('2026-10-01', '20:99'), null)
  assertEquals(berlinIso('2026-10-01', 'abc'), null)
})

Deno.test('BERLIN.country is ISO-2 — events.country is CHECK-constrained', () => {
  assertEquals(BERLIN.country.length, 2)
  assertEquals(BERLIN.country, 'DE')
})

// ---------------------------------------------------------------- BKA

// A lazyloaded row: real image in data-src, placeholder flag in src.
const BKA_LAZY = `<div class="row position-relative mx-0 mb-3 align-items-center bg-light text-dark bka-spielplan-row event-wrapper "  data-month="month202610" data-pid="495" data-tid="2026-10-01 20:00:00"><div class="bka-spielplan-zeit col-6 py-2 col-sm-2 gap-3 gap-sm-1 d-flex flex-column justify-content-center text-center"><span class="m-0 text-nowrap">Do</span><span class="h5 m-0 text-nowrap event-date" data-search="1" data-eventdate="20261001">01.10.</span><a class="bka-nodeco text-dark" href="https://bka-theater-webshop.comfortticket.de/de/veranstaltung/0d60aa6d-479d-4320-8251-af131be95f9c/4812" rel="noopener noreferrer" target="_blank"><span class="text-nowrap pe-3" title="Tickets verf&uuml;gbar&#013;jetzt kaufen ..."><span style="opacity:0.65;transform:scale(0.7);display:inline-block;"><i class="pe-1 bi bi-circle-fill bka-color-gruen"></i></span><span class="event-time" data-eventtime="2000">20:00</span></span></a></div>		<div class="col-6 col-sm-2 p-0">
							<a href="/content_start.php?id=495&tid=4437">
				<img width="120" height="120" alt="Meo Wulf - Foto: Eliah Maag" class="w-100 figure-img img-fluid m-0 w-100 ratio ratio-1x1 bka-spielplan-img bka-hover-zoom lazyload" src="/images/klein_Fahne_RGB.jpg" data-src="/bilder/klein_meo-wulf-foto-eliah-maag-rgb.jpg" />								</a>
					</div>
<div class="col-9 col-sm-6 py-1 ps-sm-4 my-auto">
<a class="bka-nodeco event-title" href="/content_start.php?id=495&tid=4437">
<h2 class="m-0 p-0 h5" data-search="1">Meo Wulf:</h2>
<h3 class="m-0 p-0 h6 text-dark" data-search="1">Therapie</h3></a>
<span class="description" data-search="1">
 Starg&auml;st*in: Barbie Breakout
</span></br>
<div class="d-flex flex-wrap align-items-center gap-1" data-search="1"><div class="bka-badge-container d-flex flex-wrap gap-1 align-items-center"><span class="m-0 p-0 badge bka-badge " data-badge="Talk">Talk</span></div></div></div>
<footer>`

// The first screenful is NOT lazyloaded: real image in src, no data-src at all.
const BKA_EAGER = `<div class="row position-relative mx-0 mb-3 align-items-center bg-light text-dark bka-spielplan-row event-wrapper "  data-month="month202608" data-pid="166" data-tid="2026-08-22 20:00:00"><div class="bka-spielplan-zeit col-6"><span class="event-time" data-eventtime="2000">20:00</span></div>		<div class="col-6 col-sm-2 p-0">
							<a href="/content_start.php?id=166&tid=4164">
				<img width="120" height="120" alt="Rachel Hat Talent - Foto: Julian Krissel" class="w-100 figure-img img-fluid m-0 w-100 ratio ratio-1x1 bka-spielplan-img bka-hover-zoom" src="/bilder/klein_rachel-hat-talent-foto-julian-krissel-rgb.jpg" />								</a>
					</div>
<div class="col-9 col-sm-6 py-1 ps-sm-4 my-auto">
<a class="bka-nodeco event-title" href="/content_start.php?id=166&tid=4164">
<h2 class="m-0 p-0 h5" data-search="1">Rachel Intervention:</h2>
<h3 class="m-0 p-0 h6 text-dark" data-search="1">RACHEL HAT TALENT</h3></a>
<div class="d-flex flex-wrap align-items-center gap-1" data-search="1"><div class="bka-badge-container d-flex flex-wrap gap-1 align-items-center"><span class="m-0 p-0 badge bka-badge " data-badge="Drag-Show & Comedy">Drag-Show & Comedy</span></div></div></div>
<footer>`

// A dark night: `bka-spielfrei` on the row, house-flag placeholder image, and
// the h2 is NOT wrapped in an event-title anchor.
const BKA_SPIELFREI = `<div class="row position-relative mx-0 mb-3 align-items-center bg-light text-dark bka-spielplan-row event-wrapper bka-spielfrei"  data-month="month202608" data-pid="422" data-tid="2026-08-25 20:00:00"><div class="bka-spielplan-zeit col-6"><span class="h5 m-0 text-nowrap event-date" data-search="1" data-eventdate="20260825">25.08.</span></div>		<div class="col-6 col-sm-2 p-0">
			<img width="120" height="120" alt="Fahne" class="w-100 figure-img img-fluid m-0 w-100 ratio ratio-1x1 bka-spielplan-img bka-hover-zoom" src="/bilder/klein_Fahne_RGB.jpg" />						</div>
<div class="col-9 col-sm-6 py-1 ps-sm-4 my-auto">
<h2 class="m-0 p-0 h5" data-search="1">Keine Abendvorstellung</h2>
<div class="d-flex flex-wrap align-items-center gap-1" data-search="1"></div></div>
<footer>`

Deno.test('parseBkaSpielplan: reads a lazyloaded row', () => {
  const [e] = parseBkaSpielplan(BKA_LAZY)
  assertEquals(e.productionId, '495')
  assertEquals(e.date, '2026-10-01')
  assertEquals(e.time, '20:00')
  assertEquals(e.startIso, '2026-10-01T20:00:00+02:00')
  assertEquals(e.title, 'Meo Wulf')
  assertEquals(e.subtitle, 'Therapie')
  assertEquals(e.description, 'Stargäst*in: Barbie Breakout')
  assertEquals(e.badges, ['Talk'])
  assertEquals(e.image, 'https://www.bka-theater.de/bilder/klein_meo-wulf-foto-eliah-maag-rgb.jpg')
  assertEquals(
    e.ticketUrl,
    'https://bka-theater-webshop.comfortticket.de/de/veranstaltung/0d60aa6d-479d-4320-8251-af131be95f9c/4812',
  )
  assertEquals(e.detailUrl, 'https://www.bka-theater.de/content_start.php?id=495&tid=4437')
})

Deno.test('parseBkaSpielplan: an eager row keeps its src image', () => {
  // Reading only data-src silently dropped the seven above-the-fold
  // productions, image and all.
  const [e] = parseBkaSpielplan(BKA_EAGER)
  assertEquals(
    e.image,
    'https://www.bka-theater.de/bilder/klein_rachel-hat-talent-foto-julian-krissel-rgb.jpg',
  )
  assertEquals(e.title, 'Rachel Intervention')
  assertEquals(e.badges, ['Drag-Show & Comedy'])
})

Deno.test('parseBkaSpielplan: never emits the house-flag placeholder as an image', () => {
  const html = BKA_LAZY.replace(
    'data-src="/bilder/klein_meo-wulf-foto-eliah-maag-rgb.jpg"',
    'data-src="/bilder/klein_Fahne_RGB.jpg"',
  )
  assertEquals(parseBkaSpielplan(html)[0].image, null)
})

Deno.test('parseBkaSpielplan: drops dark nights, not shows', () => {
  assertEquals(parseBkaSpielplan(BKA_SPIELFREI).length, 0)
  // …and still drops it if the class disappears but the title stays.
  assertEquals(parseBkaSpielplan(BKA_SPIELFREI.replace(' bka-spielfrei', '')).length, 0)
  // …and still drops it if the title changes but the class stays.
  assertEquals(
    parseBkaSpielplan(BKA_SPIELFREI.replace('Keine Abendvorstellung', 'Vorstellung entfällt')).length,
    0,
  )
})

Deno.test('parseBkaSpielplan: production id alone is not an identity', () => {
  // One production runs many nights; pid + date is what source_entity_id uses.
  const two = BKA_LAZY + BKA_LAZY.replace('2026-10-01 20:00:00', '2026-10-02 20:00:00')
  const rows = parseBkaSpielplan(two)
  assertEquals(rows.length, 2)
  assertEquals(new Set(rows.map((r) => r.productionId)).size, 1)
  assertEquals(new Set(rows.map((r) => `${r.productionId}:${r.date}`)).size, 2)
})

// -------------------------------------------------------- Siegessäule list

const SIEG_DAY = `<section class="content listing"><h3>Mix</h3><ul class="content-list">
<li><div class="content-block"><a sapper:prefetch href="/termine/mix/flo%C3%9Ffahrt-pro-plus-berlin-ev/2026-08-22/10:00/"><div class="teaser svelte-zsimk3">
    <div class="text"><div class="typography--overline">22. Aug. 2026, 10:00</div>
      <h4 class="svelte-zsimk3">Flo&szlig;fahrt pro plus berlin e.V.</h4>
      <div class="event-description typography--subtitle1 svelte-18tg6ee">Flo&szlig;fahrt</div>
                          <div class="venue-title typography--subtitle2"><span class="icon svelte-1vpup10"><svg xmlns="http://www.w3.org/2000/svg" class="feather feather-map-pin "><path d="M21 10c0 7-9 13-9 13"></path><circle cx="12" cy="10" r="3"></circle></svg></span>
                              Marina Base Berlin
                            </div></div></div></a></div></li>
<li><div class="content-block"><a sapper:prefetch href="/termine/sex/naked-sex-party/2026-08-22/22:00/"><div class="teaser svelte-zsimk3">
    <div class="text"><div class="typography--overline">22. Aug. 2026, 22:00</div>
      <h4 class="svelte-zsimk3">Naked Sex Party</h4>
      <div class="venue-title typography--subtitle2"><span class="icon svelte-1vpup10"><svg class="feather feather-map-pin "></svg></span>
                              Lab.oratory
                            </div></div></div></a></div></li></ul></section>`

Deno.test('parseSiegessaeuleDay: identity comes off the href', () => {
  const refs = parseSiegessaeuleDay(SIEG_DAY)
  assertEquals(refs.length, 2)
  const [a, b] = refs
  assertEquals(a.category, 'mix')
  // The slug stays PERCENT-ENCODED — that is the form that addresses the
  // detail page, and decoding it would break the fetch.
  assertEquals(a.slug, 'flo%C3%9Ffahrt-pro-plus-berlin-ev')
  assertEquals(a.date, '2026-08-22')
  assertEquals(a.time, '10:00')
  assertEquals(a.title, 'Floßfahrt pro plus berlin e.V.')
  assertEquals(a.venueName, 'Marina Base Berlin')
  assertEquals(
    a.url,
    'https://www.siegessaeule.de/termine/mix/flo%C3%9Ffahrt-pro-plus-berlin-ev/2026-08-22/10:00/',
  )
  assertEquals(b.category, 'sex')
  assertEquals(b.venueName, 'Lab.oratory')
})

Deno.test('parseSiegessaeuleDay: one occurrence is emitted once', () => {
  assertEquals(parseSiegessaeuleDay(SIEG_DAY + SIEG_DAY).length, 2)
})

// ------------------------------------------------------ Siegessäule detail

// Verbatim excerpt of https://www.siegessaeule.de/termine/kultur/cabaret-24/
// 2026-08-22/20:00/ — a Sapper render with NO h1/h2, hashtags as plain text,
// TWO .richtext blocks (the second is the venue's own blurb) and an og:image
// that is a signed, expiring GCS URL.
const SIEG_DETAIL = `<html><head>
<meta property="og:title" content="Cabaret &ndash; Das Musical im Tipi">
<meta property="og:image" content="https://cdn.siegessaeule.de/original_images/CABARET.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&amp;X-Goog-Expires=86400&amp;X-Goog-Signature=deadbeef">
</head><body>
<img alt="" src="https://cdn.siegessaeule.de/images/15.6.23-PR-CABARET_2019_-_Finale-c.708735cb.fill-720x360.jpg" srcset="https://cdn.siegessaeule.de/images/x.fill-320x160.jpg 320w">
<div class="richtext svelte-1fmlr68"><!-- HTML_TAG_START --><p data-block-key="g18u3">In der Kult-Inszenierung von Madonnas Choreografen Vincent Paterson &uuml;ber das queere Treiben im KitKat Club tritt diesmal Sophie Berner als Sally Bowles an.</p><p data-block-key="e1ta0">Mehr Infos &amp; Tickets:<br/><a href="https://www.tipi-am-kanzleramt.de/de/programm/cabaret.html" target="_blank" rel="noopener noreferrer">tipi-am-kanzleramt</a></p><!-- HTML_TAG_END --></div>
<p>Regie: Vincent Paterson #1920er#Cabaret#Musical#Tiergarten#queer</p>
<div><div class="content related"><h3 class="">Veranstaltungsort</h3></div></div>
<hr>
<header class="svelte-5l0ta8"><div class="content">
<h3 class="svelte-5l0ta8">Tipi am Kanzleramt</h3>
<ul class="info-list"><li><span class="icon"><svg class="feather feather-map-pin "><path d="M21 10c0 7-9 13-9 13"></path></svg>
</span>
Tipi am Kanzleramt, Gro&szlig;e Querallee, 10557 Berlin</li>
<li><a href="https://www.tipi-am-kanzleramt.de/" target="_blank" rel="noopener noreferrer">Website</a></li></ul>
<div class="richtext svelte-1fmlr68"><p>Zwischen Kanzleramt, Reichstag und Brandenburger Tor ist das Tipi Heimat von Chanson, Varie&teacute; oder Musical-Comedy.</p></div>
</div></header>
<footer><a href="https://www.siegessaeule.de/abo">SIEGESS&Auml;ULE ABO</a></footer></body></html>`

Deno.test('parseSiegessaeuleDetail: title comes from og:title (there is no h1)', () => {
  const d = parseSiegessaeuleDetail(SIEG_DETAIL)
  assertEquals(d.title, 'Cabaret – Das Musical im Tipi')
})

Deno.test('parseSiegessaeuleDetail: reads prose, tags, venue and links', () => {
  const d = parseSiegessaeuleDetail(SIEG_DETAIL)
  assertEquals(d.description?.startsWith('In der Kult-Inszenierung'), true)
  // The trailing "Mehr Infos & Tickets:" link label is not prose.
  assertEquals(d.description?.includes('Mehr Infos'), false)
  assertEquals(d.hashtags, ['1920er', 'Cabaret', 'Musical', 'Tiergarten', 'queer'])
  assertEquals(d.venueName, 'Tipi am Kanzleramt')
  assertEquals(d.venueAddress, 'Tipi am Kanzleramt, Große Querallee, 10557 Berlin')
  assertEquals(d.venueUrl, 'https://www.tipi-am-kanzleramt.de/')
})

Deno.test('parseSiegessaeuleDetail: the VENUE blurb is never the event description', () => {
  // There are two .richtext blocks and the second describes the venue. Taking
  // the wrong one files the same paragraph as the description of every event
  // that venue ever hosts.
  const d = parseSiegessaeuleDetail(SIEG_DETAIL)
  assertEquals(d.description?.includes('Heimat von Chanson'), false)
})

Deno.test('parseSiegessaeuleDetail: image is the CDN path, never the signed og:image', () => {
  // og:image is a signed GCS URL carrying X-Goog-Expires=86400 — storing it
  // yields a working picture today and a broken one tomorrow.
  const d = parseSiegessaeuleDetail(SIEG_DETAIL)
  assertEquals(d.image, 'https://cdn.siegessaeule.de/images/15.6.23-PR-CABARET_2019_-_Finale-c.708735cb.fill-720x360.jpg')
  assertEquals(d.image?.includes('X-Goog-Expires'), false)
})

Deno.test('parseSiegessaeuleDetail: the footer never leaks into the venue', () => {
  const d = parseSiegessaeuleDetail(SIEG_DETAIL)
  assertEquals(d.venueUrl?.includes('siegessaeule.de'), false)
})

// ----------------------------------------------------------- Lab.oratory

// Two blocks: the first ("TONIGHT") carries no uuid, the second does.
const LAB = `<div id='august' class='date'>
<div itemscope="" itemtype="http://schema.org/Event">
<div itemprop="startDate" content="2026-08-22T22:00:00" style='font-size:50px'><span style='color:red'>TONIGHT</span></div>
<div style='font-size:30px'>22.08.2026 22:00</div>
<div itemprop="name" style='font-size:30px'><a href="https://www.lab-oratory.de/sneakersox" style='color:#ffffff'>SNEAKERSOX</a></div>
<div style='font-size:18px'><span itemprop="description">strict dresscode: sneaker, socks</span></div>
<div style='font-size:18px'>doors 22:00 to 24:00</div>
<span itemprop="location" itemscope="" itemtype="http://schema.org/Place"><meta itemprop="name" content="Lab.oratory"><meta itemprop="address" content="Am Wriezener Bahnhof, 10243 Berlin"></span></div></div>
<div id='ad983b7e-47c8-4a87-a9e1-cce68d21a189' itemscope="" itemtype="http://schema.org/Event" class='date'>
<div itemprop="startDate" content="2026-11-01T16:00:00"></div>
<div itemprop="name"><a href="https://www.lab-oratory.de/yellow-facts">YELLOW FACTS</a></div>
<div><span itemprop="description">no dresscode, piss and fuck</span></div>
<div>doors 16:00 to 18:00</div>
<span itemprop="location" itemscope="" itemtype="http://schema.org/Place"><meta itemprop="name" content="Lab.oratory"><meta itemprop="address" content="Am Wriezener Bahnhof, 10243 Berlin"></span></div>
<div class='footer'></div>`

Deno.test('parseLabOratory: reads schema.org microdata, not JSON-LD', () => {
  const ev = parseLabOratory(LAB)
  assertEquals(ev.length, 2)
  assertEquals(ev[0].title, 'SNEAKERSOX')
  assertEquals(ev[0].slug, 'sneakersox')
  assertEquals(ev[0].description, 'strict dresscode: sneaker, socks')
  assertEquals(ev[0].doors, 'doors 22:00 to 24:00')
  assertEquals(ev[0].venueName, 'Lab.oratory')
  assertEquals(ev[0].venueAddress, 'Am Wriezener Bahnhof, 10243 Berlin')
  assertEquals(ev[0].blockId, null)
  assertEquals(ev[1].blockId, 'ad983b7e-47c8-4a87-a9e1-cce68d21a189')
})

Deno.test('parseLabOratory: a bare startDate is BERLIN time, not UTC', () => {
  // The microdata carries "2026-08-22T22:00:00" with no offset. Passing it
  // through as-is reads it as UTC and lands the party 1–2 h early — for a
  // doors-22:00-to-24:00 club that is the difference between open and closed.
  const ev = parseLabOratory(LAB)
  assertEquals(ev[0].startIso, '2026-08-22T22:00:00+02:00') // CEST
  assertEquals(ev[1].startIso, '2026-11-01T16:00:00+01:00') // CET, after the switch
})

// ----------------------------------------------------------- Böse Buben

// The two link-title shapes the site actually emits. The second one is what
// broke the first parser.
const BB = `<div class="mod_eventlist block" id="eventliste">
<article class="event block layout_upcoming current even first cal_17 ">
<time datetime="1787421600" class="date"><div class="from"><span class="day">22</span><span class="month">August</span><span class="time">20:00</span><span class="time timeto">04:00</span></div></time>
<div class="body "><h2><a href="/readmore/red-session-3.html?day=20260822" title="RED-Session  - 4.Samstag im Monat				(2026-08-22 20:00&ndash;2026-08-23 04:00)">RED-Session</a></h2>
<p class="teaser"><h6 class="bodytext">Long term Fist Party</h6></p>
<div class="more"><a class="btn " href="/readmore/red-session-3.html?day=20260822" title="RED-Session  - 4.Samstag im Monat (2026-08-22 20:00&ndash;2026-08-23 04:00)">Read more &hellip;</a></div></div>
</article>
<article class="event block layout_upcoming upcoming odd cal_3 ">
<time datetime="1787490000" class="date"><div class="from"><span class="day">23</span><span class="month">August</span></div></time>
<div class="body "><h2><a href="/readmore/spank-club-2.html?day=20260823" title="SPANK-Club				(Sunday, 2026-08-23, 15:00&ndash;21:00)">SPANK-Club</a></h2>
<p class="teaser">He that will not hear must feel!</p></div>
</article></div>`

Deno.test('parseBoeseBubenList: start comes from the unix timestamp', () => {
  const ev = parseBoeseBubenList(BB)
  assertEquals(ev.length, 2)
  assertEquals(ev[0].slug, 'red-session-3')
  assertEquals(ev[0].day, '20260822')
  assertEquals(ev[0].startIso, '2026-08-22T20:00:00+02:00')
  assertEquals(ev[0].title, 'RED-Session')
  assertEquals(ev[0].teaser, 'Long term Fist Party')
})

Deno.test('parseBoeseBubenList: BOTH link-title shapes yield an end time', () => {
  // Deriving the START from this text instead of the timestamp is what made a
  // 15:00 Sunday afternoon commit as a 00:00 start: the same-day shape
  // "(Sunday, 2026-08-23, 15:00–21:00)" does not match the spanning shape
  // "(2026-08-22 20:00–2026-08-23 04:00)", and the fallback was midnight.
  const ev = parseBoeseBubenList(BB)
  assertEquals(ev[0].endIso, '2026-08-23T04:00:00+02:00') // crosses midnight
  assertEquals(ev[1].startIso, '2026-08-23T15:00:00+02:00')
  assertEquals(ev[1].endIso, '2026-08-23T21:00:00+02:00') // same day
})

Deno.test('parseBoeseBubenList: no event may land at midnight by fallback', () => {
  for (const e of parseBoeseBubenList(BB)) {
    assertEquals(/T00:00/.test(e.startIso ?? ''), false, `${e.slug} fell back to midnight`)
  }
})

Deno.test('parseBoeseBubenList: slug+day is the identity, and it dedupes', () => {
  const ev = parseBoeseBubenList(BB + BB)
  assertEquals(ev.length, 2)
  assertEquals(new Set(ev.map((e) => `${e.slug}:${e.day}`)).size, 2)
})

// ---------------------------------------------------------- Ticketcorner

const TC_SUB = [
  {
    '@type': 'TheaterEvent',
    startDate: '2026-09-04T20:30:00.000+02:00',
    name: 'Travestie im Kiez .... circus of drag queens!',
    image: 'https://www.ticketcorner.ch/obj/media/CH-eventim/galery/222x222/2025/tik.jpg',
    location: {
      '@type': 'EventVenue',
      name: 'tikberlin.de - THEATER IM KELLER',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'DE',
        addressLocality: 'BERLIN / NEUKÖLLN',
        postalCode: '12047',
        streetAddress: 'Weserstr. 211 beim Hermannplatz',
      },
    },
    offers: [
      {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        category: 'Preiskategorie 2',
        price: '62.30',
        priceCurrency: 'CHF',
        url: 'https://www.ticketcorner.ch/event/travestie-im-kiez-tikberlin-de-theater-im-keller-21175484/',
      },
      {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
        category: 'Preiskategorie 1',
        price: '48.65',
        priceCurrency: 'CHF',
        url: 'https://www.ticketcorner.ch/event/travestie-im-kiez-tikberlin-de-theater-im-keller-21175484/',
      },
    ],
  },
]

Deno.test('parseTicketcornerSubEvents: id off the offer URL, cheapest price', () => {
  const [e] = parseTicketcornerSubEvents(TC_SUB)
  assertEquals(e.eventId, '21175484')
  assertEquals(e.startIso, '2026-09-04T20:30:00.000+02:00')
  assertEquals(e.venueName, 'tikberlin.de - THEATER IM KELLER')
  assertEquals(e.postalCode, '12047')
  assertEquals(e.country, 'DE')
  // The listing advertises "ab CHF x" — the cheapest category, not the first.
  assertEquals(e.price, 48.65)
  assertEquals(e.currency, 'CHF')
})

Deno.test('parseTicketcornerSubEvents: skips entries with no id, date or name', () => {
  assertEquals(parseTicketcornerSubEvents([{ name: 'x' }, { startDate: '2026-01-01' }, {}]).length, 0)
  // An offer with no numeric tail yields no stable identity, so no row.
  assertEquals(
    parseTicketcornerSubEvents([
      { ...TC_SUB[0], offers: [{ url: 'https://www.ticketcorner.ch/event/no-id/' }] },
    ]).length,
    0,
  )
})

// ------------------------------------------------------------ event type

Deno.test('inferEventType: German first — these sources publish no English', () => {
  assertEquals(inferEventType('Travestie im Kiez'), 'drag')
  assertEquals(inferEventType('Rachel Intervention', 'Drag-Show & Comedy'), 'drag')
  assertEquals(inferEventType('Lesbisch-schwules Stadtfest', 'CSD Berlin'), 'pride')
  assertEquals(inferEventType('Naked Sex Party', null, 'Darkroom'), 'fetish')
  assertEquals(inferEventType('Improtania', 'Improtheater'), 'theater')
  assertEquals(inferEventType('Konzert im Garten'), 'concert')
  assertEquals(inferEventType('Lesben-Stammtisch'), 'social')
  assertEquals(inferEventType('Queer Yoga'), 'sports')
  assertEquals(inferEventType('Kundgebung gegen Hass'), 'protest')
  assertEquals(inferEventType('Vernissage'), 'exhibition')
  assertEquals(inferEventType(''), 'other')
})

Deno.test('inferEventType: specific beats generic', () => {
  // A drag party is drag, not a party; a pride party is pride.
  assertEquals(inferEventType('Drag Party'), 'drag')
  assertEquals(inferEventType('CSD Party'), 'pride')
  assertEquals(inferEventType('Fetish Party'), 'fetish')
  assertEquals(inferEventType('Party'), 'party')
})

Deno.test('inferEventTypeLayered: pride is honoured from the title, not from prose or tags', () => {
  // Each of these reached the review queue or the events table as a false
  // Pride event under a flat scan over title+prose+tags.
  assertEquals(
    inferEventTypeLayered(
      'Konzert: Kai & Funky von Ton Steine Scherben',
      'Das Trio wurde bereits auf der CSD-Bühne gefeiert',
      'Konzert Queer Rock',
    ),
    'concert', // a historical mention is not a classification
  )
  assertEquals(
    inferEventTypeLayered('Unleashed by UNDR', '', 'club kinky pride sexparty sex'),
    'fetish', // during Pride season half the scene carries that tag
  )
  // …but a title that says so is still Pride.
  assertEquals(inferEventTypeLayered('CSD Berlin 2027', '', 'Pride'), 'pride')
})

Deno.test('inferEventTypeLayered: a topical pride tag is DEMOTED, never banned', () => {
  // Banning it outright was the first attempt and it dropped "Dyke March" —
  // which matches no other rung — from pride to 'other'.
  assertEquals(inferEventTypeLayered('Dyke March', '', 'pride'), 'pride')
})

Deno.test('inferEventTypeLayered: a guided tour outranks the words in its subject', () => {
  // "Öffentliche Führung: Cruising the Countryside — Queeres Leben auf dem
  // Land" is a museum tour; matching `cruis` first filed it as fetish.
  assertEquals(
    inferEventTypeLayered('Öffentliche Führung: Cruising the Countryside', '', 'Ausstellung queer'),
    'exhibition',
  )
})

Deno.test('inferEventType: every verdict is in the events_event_type_check vocabulary', () => {
  const VOCAB = new Set([
    'party', 'festival', 'pride', 'fetish', 'community', 'meetup', 'conference',
    'workshop', 'concert', 'film', 'drag', 'sports', 'art', 'theater',
    'fundraiser', 'protest', 'social', 'fair', 'cruise', 'comedy', 'exhibition',
    'other',
  ])
  const probes = [
    'Travestie', 'CSD', 'Fetisch', 'Kabarett', 'Kino', 'Festival', 'Konzert',
    'Ausstellung', 'Musical', 'Stand-up', 'Yoga', 'Kongress', 'Workshop',
    'Demo', 'Selbsthilfegruppe', 'Rave', 'Flohmarkt', 'Brunch', 'Benefiz', '',
  ]
  // trg_events_taxonomy silently coerces an off-vocabulary value to 'other',
  // so a miss here would be invisible downstream.
  for (const p of probes) {
    const t = inferEventType(p)
    assertEquals(VOCAB.has(t), true, `${p} -> ${t} is not in the vocabulary`)
  }
})
