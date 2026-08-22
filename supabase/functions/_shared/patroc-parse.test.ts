import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  inferEventType,
  mapPageCategory,
  parseCategoryPages,
  parseCityIndexEvents,
  parseListingPage,
  PATROC_CITIES,
  splitCityLine,
} from './patroc-parse.ts'

// Trimmed verbatim from https://www.patroc.com/gay/berlin/bars.html (2026-08-22).
const BARS_HTML = `
<div id="Content">
<h1 class="font">Gay Bars in Berlin</h1>

<div class="item" id="323">
<p class="arrow_top"><a href="#Page">&uarr;</a></p><div id="barenhohle" class="locationname">
  <span><strong><a class="url" href="d/barenhohle.html">B&auml;renh&ouml;hle</a></strong></span>
</div>
<div class="open"><nobr>Monday-Friday 18:00&nbsp;&ndash;&nbsp;03:00;</nobr> <nobr>Saturday 20:00&nbsp;&ndash;&nbsp;03:00</nobr></div>
<div class="description notes">Bear-friendly neighbourhood bar in Berlin-Prenzlauer Berg. <br />
Smoking bar.</div>
<div class="communication"><a target="_blank" rel="nofollow noopener" href="https://xn--brenhhle-berlin-ktb6f.de">b&auml;renh&ouml;hle-berlin.de</a></div>
<div class="adr" style="margin-top:30px;"><span style="display:inline;">@ </span>
Sch&ouml;nhauser Allee 90 <br />
Berlin 10439
</div>
<div class="transport">U, S, Night busses: Sch&ouml;nhauser Allee</div>
<div class="line_phone"><span class="tel"><a href="tel:+49 30 4473 6553">+49 30 4473 6553</a></span></div>
<div><button type="button" class="mapbutton" onclick="javascript:map_external('52.553169','13.414830',15,'323','ChIJ0SoXUw9SqEcRjSwGhRObxH8');">Map & Reviews</button></div>
</div>

<div id="Footer">
`

// Trimmed from clubs.html — one dated one-off, one venue, one recurring party.
const CLUBS_HTML = `
<div id="Content">
<h1 class="font">Gay Clubs and Parties in Berlin</h1>

<h2 id="irregular_events" class="font">Upcoming Irregular Parties</h2>

<div class="vevent item" id="event5612">
<div id="piepshow-party" class="locationname">
  <strong><a class="url" href="d/piepshow-party.html"><span class="summary">PiepShow Party</span></a></strong>
</div>
<div class="open"><abbr class="dtstart" title="2026-08-28"></abbr>Friday, 28 August 2026, <span style="white-space: nowrap">20:00 &ndash; 10:00</span></div>
<div class="description notes">Monthly Techno party for queers and friends.</div>
<div class="communication"><a target="_blank" rel="noopener" href="https://www.instagram.com/piepshow_berlin/">instagram.com/piepshow_berlin</a></div>
<div class="adr" style="margin-top:30px;">
<span style="display:block;">@ KitKatClub</span>
K&ouml;penicker Stra&szlig;e 76/Br&uuml;ckenstra&szlig;e <br />
Berlin 10179
</div>
<div><button type="button" class="mapbutton" onclick="javascript:map_external('52.511299','13.416770',15,'event5612','ChIJhdBrMiVOqEcRx0BtYoomxt8');">Map</button></div>
</div>

<h2 id="regular" class="font">Regular Parties and Clubs</h2>

<div class="item" id="288">
<div id="berghain" class="locationname">
  <span><strong><a class="url" href="d/berghain.html">Berghain</a></strong></span>
</div>
<div class="open">Friday and Saturday night</div>
<div class="description notes">World-famous techno club.</div>
<div class="adr"><span style="display:inline;">@ </span>
Am Wriezener Bahnhof <br />
Berlin 10243
</div>
<div><button type="button" class="mapbutton" onclick="javascript:map_external('52.511100','13.443000',15,'288','');">Map</button></div>
</div>

<div class="vevent item" id="290">
<div id="gayhane" class="locationname">
  <strong><a class="url" href="d/gayhane.html"><span class="summary">Gayhane</span></a></strong>
</div>
<div class="open">Usually last Saturday of the month, from 22:00/23:00<br />
<abbr class="dtstart" title="2026-08-29"></abbr>Next party: 29 August 2026<abbr class="dtend" title="2026-08-30"></abbr></div>
<div class="description notes">Oriental party for LGBTs and friends.<br />Admission: 8-15&nbsp;&euro;</div>
<div class="communication"><a target="_blank" rel="nofollow noopener" href="https://www.so36.com/tickets">www.so36.com</a></div>
<div class="adr">
<span style="display:block;">@ SO36</span>
Oranienstra&szlig;e 190 <br />
Berlin 10999
</div>
  <span class="location vcard"><abbr class="fn org" title="SO36"></abbr></span>
<div><button type="button" class="mapbutton" onclick="javascript:map_external('52.500370','13.422000',15,'290','ChIJJ3wVXzROqEcReCrNEz6pVz4');">Map</button></div>
</div>

<div id="Footer">
`

const HOTELS_HTML = `
<div id="Content">
<h1 class="font">Berlin Accommodation Tips</h1>
<h2 class="font hotels">Gay Hotels in Berlin</h2>

<div class="item" id="43" style="clear:right;">
<div id="hotelconnection" class="locationname">
  <span><strong><a class="url" href="d/hotelconnection.html"> ArtHotel Connection</a></strong></span>
</div>
<div class="hoteltype">Gay Hotel. From 60&nbsp;&euro;</div>
<div class="communication"><div><a class="website" target="_blank" href="https://www.booking.com/hotel/de/arthotel-connection-gay.html?aid=308674">Reviews, Photos &amp; Reservation</a></div></div>
<div class="notes">Gay-oriented hotel with 16 rooms in Berlin-Sch&ouml;neberg.</div>
<div class="adr"><span style="display:inline;">@ </span>
Fuggerstra&szlig;e 33 <br />
Berlin 10777
</div>
<div><button type="button" class="mapbutton" onclick="javascript:map_external('52.499020','13.342850',15,'43','');">Map</button></div>
</div>

<h2 class="hotels other">Other Hotels in Berlin </h2>

<div class="item" id="324" style="clear:right;">
<div id="motelone" class="locationname">
  <span><strong><a class="url" href="d/motelone.html"> Hotel Motel One</a></strong></span>
</div>
<div class="adr"><span style="display:inline;">@ </span>
Somestra&szlig;e 1 <br />
Berlin 10777
</div>
</div>

<div id="Footer">
`

// Trimmed from the Berlin city index (2026-08-22).
const INDEX_HTML = `
<h2 id="news" class="font">Upcoming Events in Berlin</h2>

<div class="vevent" id="news5612">
<div class="news-date">&#124;&nbsp;&nbsp;<abbr class="dtstart" title="2026-08-28"></abbr>28 August 2026</div>
<div class="news-content"><strong class="summary"><a class="url" href="d/piepshow-party.html">PiepShow Party</a></strong>:
 <span class="description">monthly Techno party for queers and friends. <br />
Dresscode: sporty, kinky, creative. <br />
</span>
20:00 &ndash; 10:00 <span class="location vcard"> @ <span class="fn org">KitKatClub</span> (<span class="adr"><span class="street-address">K&ouml;penicker Stra&szlig;e 76/Br&uuml;ckenstra&szlig;e</span></span>) </span>
<span class="button_offset"></span> <button type="button" class="showmap_news" onclick="javascript:map_external('52.511299','13.416770',15,'5612','ChIJhdBrMiVOqEcRx0BtYoomxt8');">Map</button>
</div>
<div class="news-website"><a href="https://www.instagram.com/piepshow_berlin/" target="_blank" rel="noopener"><span class="linkpfeil">-&rsaquo;&nbsp; </span>instagram.com/piepshow_berlin</a></div>
</div>

<div class="vevent" id="news39">
<div class="news-date">&#124;&nbsp;&nbsp;<abbr class="dtstart" title="2026-08-29"></abbr>29 August 2026</div>
<div class="news-content"><strong class="summary"><a class="url" href="d/langenachtdermuseen.html">Long Night of Museums</a></strong>:
 <span class="description">from 18:00 till 02:00, Berlin's museums open their doors again.<br />
</span>
<span class="location vcard"><abbr class="fn org" title="Berlin"></abbr> <span class="adr"><span class="street-address"></span></span></span>
</div>
<div class="news-website"><a href="https://langenachtdermuseen.berlin/en/" target="_blank" rel="noopener">langenachtdermuseen.berlin</a></div>
</div>

<h2 class="font" id="gaylife">About Berlin and its gay life</h2>
`

Deno.test('parseListingPage extracts a venue with every field', () => {
  const { venues, events } = parseListingPage(BARS_HTML, 'bars')
  assertEquals(events.length, 0)
  assertEquals(venues.length, 1)
  const v = venues[0]
  assertEquals(v.id, '323')
  assertEquals(v.slug, 'barenhohle')
  assertEquals(v.name, 'Bärenhöhle')
  assertEquals(v.description, 'Bear-friendly neighbourhood bar in Berlin-Prenzlauer Berg. Smoking bar.')
  assertEquals(v.websites, ['https://xn--brenhhle-berlin-ktb6f.de'])
  assertEquals(v.street, 'Schönhauser Allee 90')
  assertEquals(v.cityLine, 'Berlin 10439')
  assertEquals(v.phone, '+49 30 4473 6553')
  assertEquals(v.lat, 52.553169)
  assertEquals(v.lng, 13.41483)
  assertEquals(v.googlePlaceId, 'ChIJ0SoXUw9SqEcRjSwGhRObxH8')
  assertEquals(v.hoursText?.includes('Monday-Friday 18:00'), true)
})

Deno.test('parseListingPage discriminates venues, one-offs and recurring parties', () => {
  const { venues, events } = parseListingPage(CLUBS_HTML, 'clubs')
  assertEquals(venues.map((v) => v.id), ['288'])
  assertEquals(venues[0].name, 'Berghain')

  assertEquals(events.length, 2)
  const oneOff = events.find((e) => e.id === '5612')!
  assertEquals(oneOff.title, 'PiepShow Party')
  assertEquals(oneOff.recurring, false)
  assertEquals(oneOff.startDate, '2026-08-28')
  assertEquals(oneOff.startTime, '20:00')
  assertEquals(oneOff.endTime, '10:00')
  assertEquals(oneOff.venueName, 'KitKatClub')
  assertEquals(oneOff.cityLine, 'Berlin 10179')
  assertEquals(oneOff.googlePlaceId, 'ChIJhdBrMiVOqEcRx0BtYoomxt8')

  const rec = events.find((e) => e.id === '290')!
  assertEquals(rec.title, 'Gayhane')
  assertEquals(rec.recurring, true)
  assertEquals(rec.startDate, '2026-08-29')
  assertEquals(rec.endDate, '2026-08-30')
  assertEquals(rec.venueName, 'SO36')
  // "from 22:00/23:00" — the from-arm of the time parser
  assertEquals(rec.startTime, '22:00')
})

Deno.test('parseListingPage drops the "Other Hotels" mainstream-tip section', () => {
  const { venues } = parseListingPage(HOTELS_HTML, 'hotels')
  assertEquals(venues.map((v) => v.name), ['ArtHotel Connection'])
  // booking.com affiliate link is patroc monetisation, not the hotel website
  assertEquals(venues[0].websites, [])
  assertEquals(venues[0].description, 'Gay-oriented hotel with 16 rooms in Berlin-Schöneberg.')
})

Deno.test('parseCityIndexEvents reads the hCalendar blocks', () => {
  const evs = parseCityIndexEvents(INDEX_HTML)
  assertEquals(evs.length, 2)
  const [a, b] = evs
  assertEquals(a.id, '5612')
  assertEquals(a.title, 'PiepShow Party')
  assertEquals(a.startDate, '2026-08-28')
  // time comes from the loose text, NOT the description's own "from 18:00"
  assertEquals(a.startTime, '20:00')
  assertEquals(a.endTime, '10:00')
  assertEquals(a.venueName, 'KitKatClub')
  assertEquals(a.street, 'Köpenicker Straße 76/Brückenstraße')
  assertEquals(a.lat, 52.511299)
  assertEquals(a.websites, ['https://www.instagram.com/piepshow_berlin/'])

  assertEquals(b.id, '39')
  assertEquals(b.title, 'Long Night of Museums')
  // city-level event: abbr fn org carries the CITY, street is empty
  assertEquals(b.venueName, 'Berlin')
  assertEquals(b.street, null)
  assertEquals(b.startTime, null)
})

Deno.test('parseCategoryPages finds both href and bpu() menu links', () => {
  const menu = `
  <div id="categories">
  <div><a href="https://www.patroc.com/gay/berlin/hotels.html">Gay Hotels</a></div>
  <div><a href="javascript:bpu('cafes.html', '1746443', 'en');">Cafes</a></div>
  <div><a href="javascript:bpu('bars.html', '1746443', 'en');">Bars</a></div>
  <div><a href="https://www.patroc.com/gay/berlin/cinemas.html">Cinemas</a></div>
  <div class="menuall"><a href="https://www.patroc.com/gay/berlin/gayguide.html">Gay Guide</a></div>
  <div id="show_cities" class="menulist"><span>Other cities</span></div>`
  const pages = parseCategoryPages(menu).sort()
  assertEquals(pages, ['bars', 'cafes', 'cinemas', 'hotels'])
})

Deno.test('splitCityLine handles postal formats and bare city names', () => {
  assertEquals(splitCityLine('Berlin 10245'), { city: 'Berlin', postal: '10245' })
  assertEquals(splitCityLine('London SE1 3UJ'), { city: 'London', postal: 'SE1 3UJ' })
  assertEquals(splitCityLine('Playa del Inglés'), { city: 'Playa del Inglés', postal: null })
  assertEquals(splitCityLine(null), { city: null, postal: null })
})

Deno.test('category + event-type mapping stays inside the CHECK vocabularies', () => {
  assertEquals(mapPageCategory('bars'), 'bar')
  assertEquals(mapPageCategory('cinemas'), 'cruising')
  assertEquals(mapPageCategory('unknown-page'), 'other')
  assertEquals(inferEventType('CSD Berlin Pride', null), 'pride')
  assertEquals(inferEventType('PiepShow Party', 'techno for queers'), 'party')
  assertEquals(inferEventType('Long Night of Museums', 'museums open their doors'), 'exhibition')
  assertEquals(inferEventType('Something', null), 'other')
})

Deno.test('every patroc city carries an ISO2 country and an IANA timezone', () => {
  for (const [slug, c] of Object.entries(PATROC_CITIES)) {
    if (!/^[A-Z]{2}$/.test(c.country)) throw new Error(`${slug}: bad country ${c.country}`)
    if (!/^(Europe|Atlantic)\/[A-Za-z_]+$/.test(c.timezone)) {
      throw new Error(`${slug}: bad timezone ${c.timezone}`)
    }
  }
})
