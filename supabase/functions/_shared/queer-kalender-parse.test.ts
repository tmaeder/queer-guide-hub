import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseQueerKalender, parseLocation, parseDetails, endFromDates } from './queer-kalender-parse.ts'

// Real markup from https://queer-kalender.nl/en/ captured 2026-09-28, trimmed
// of the inline SVGs. Both calendar deeplinks are kept because the parser
// must read exactly one event out of the pair.
const ARTICLE = `<article class="c-calendar-item">
    <h3 class="c-calendar-item__title">
        Bottoms up bar
    </h3>
<div class="c-calendar-item__date">
    <time datetime="2026-09-29T18:30:00+02:00">
                    <span>Tue 29 sep</span>
            <span class="c-calendar-item__date__time">18:30</span>
                - <span class="c-calendar-item__date__time">01:00</span>
    </time>
<button popovertarget="share-cal-1225" popovertargetaction="toggle" class="c-share-event-toggle"> Add to calendar</button>
<div id="share-cal-1225" popover class="c-share-event">
    <ul class="c-share-event__content">
        <li><a href="https://www.google.com/calendar/render?action=TEMPLATE&text=Bottoms+up+bar&dates=20260929T1830/20260930T0100&details=Open+to+all+flinta+folks,+women,+lesbians,+intersex,+non+binary,+trans+folks+-+Added+by+Queer+Calendar:+https://queer-kalender.nl/en/page/1225/bottoms-up-bar&location=Lellebel,Utrechtsestraat+4h,Amsterdam&trp=false" target="_blank">Add to Google calendar</a></li>
        <li><a href="https://outlook.office.com/calendar/0/deeplink/compose?body=Open+to+all+flinta+folks+-+Added+by+Queer+Calendar:+https://queer-kalender.nl/en/page/1225/bottoms-up-bar&enddt=2026-09-30T01:00&location=Lellebel,Utrechtsestraat+4h,Amsterdam&path=/calendar/action/compose&rru=addevent&startdt=2026-09-29T18:30&subject=Bottoms+up+bar" target="_blank">Add to Outlook</a></li>
    </ul>
</div>
</div>
</article>`

Deno.test('qk: parses one event out of the two deeplinks, not two', () => {
  const evs = parseQueerKalender(ARTICLE)
  assertEquals(evs.length, 1)
  const e = evs[0]
  assertEquals(e.id, '1225')
  assertEquals(e.title, 'Bottoms up bar')
  assertEquals(e.url, 'https://queer-kalender.nl/en/page/1225/bottoms-up-bar')
  assertEquals(e.venueName, 'Lellebel')
  assertEquals(e.street, 'Utrechtsestraat 4h')
  assertEquals(e.city, 'Amsterdam')
  assertEquals(e.description, 'Open to all flinta folks, women, lesbians, intersex, non binary, trans folks')
})

Deno.test('qk: the start keeps the offset the page published', () => {
  // A naive start would raise E_START_TIMEZONE_MISSING at write time.
  assertEquals(parseQueerKalender(ARTICLE)[0].start, '2026-09-29T18:30:00+02:00')
})

Deno.test('qk: the end is qualified with the START offset, not a hardcoded one', () => {
  // Amsterdam is +01:00 for half the year. The deeplink end is naive.
  assertEquals(endFromDates('20260929T1830/20260930T0100', '2026-09-29T18:30:00+02:00'), '2026-09-30T01:00:00+02:00')
  assertEquals(endFromDates('20261215T2000/20261215T2300', '2026-12-15T20:00:00+01:00'), '2026-12-15T23:00:00+01:00')
})

Deno.test('qk: an unparseable or backwards end is dropped, the event survives', () => {
  assertEquals(endFromDates(null, '2026-09-29T18:30:00+02:00'), null)
  assertEquals(endFromDates('garbage', '2026-09-29T18:30:00+02:00'), null)
  assertEquals(endFromDates('20260929T1830/20260928T0100', '2026-09-29T18:30:00+02:00'), null)
  // No offset on the start means nothing to qualify the end with.
  assertEquals(endFromDates('20260929T1830/20260930T0100', '2026-09-29T18:30:00'), null)
})

// ---- location ------------------------------------------------------------

Deno.test('qk: three parts are venue / street / city', () => {
  assertEquals(parseLocation('Lellebel,Utrechtsestraat+4h,Amsterdam'), {
    venueName: 'Lellebel', street: 'Utrechtsestraat 4h', city: 'Amsterdam',
  })
  assertEquals(parseLocation('Rita+community+center,Reguliersdwarsstraat+54,Amsterdam'), {
    venueName: 'Rita community center', street: 'Reguliersdwarsstraat 54', city: 'Amsterdam',
  })
})

Deno.test('qk: a two-part value with a house number is a STREET, not a venue', () => {
  // Publishing "Willem Witsenstraat 6" as a venue name feeds an address to
  // the event->venue linker.
  assertEquals(parseLocation('Willem+Witsenstraat+6,Amsterdam'), {
    venueName: null, street: 'Willem Witsenstraat 6', city: 'Amsterdam',
  })
})

Deno.test('qk: a two-part value with no house number is a venue', () => {
  assertEquals(parseLocation('Vrankrijk,Amsterdam'), {
    venueName: 'Vrankrijk', street: null, city: 'Amsterdam',
  })
})

Deno.test('qk: "T.B.A." is a placeholder and never becomes a venue', () => {
  assertEquals(parseLocation('T.B.A.,Amsterdam'), { venueName: null, street: null, city: 'Amsterdam' })
  assertEquals(parseLocation('TBA,Amsterdam'), { venueName: null, street: null, city: 'Amsterdam' })
  assertEquals(parseLocation('to+be+announced,Amsterdam'), { venueName: null, street: null, city: 'Amsterdam' })
})

Deno.test('qk: one part is the city alone', () => {
  assertEquals(parseLocation('Amsterdam'), { venueName: null, street: null, city: 'Amsterdam' })
})

Deno.test('qk: an absent location is all-null, not a throw', () => {
  assertEquals(parseLocation(null), { venueName: null, street: null, city: null })
  assertEquals(parseLocation(''), { venueName: null, street: null, city: null })
})

// ---- details -------------------------------------------------------------

Deno.test('qk: the "Added by Queer Calendar" suffix is chrome and is stripped', () => {
  const d = parseDetails('Party+time+-+Added+by+Queer+Calendar:+https://queer-kalender.nl/en/page/9/x')
  assertEquals(d.description, 'Party time')
  assertEquals(d.url, 'https://queer-kalender.nl/en/page/9/x')
})

Deno.test('qk: a body with no suffix keeps all of its text and yields no url', () => {
  const d = parseDetails('Just+a+description')
  assertEquals(d.description, 'Just a description')
  assertEquals(d.url, null)
})

Deno.test('qk: an empty description is null, not an empty string', () => {
  assertEquals(parseDetails('+-+Added+by+Queer+Calendar:+https://x.test/a').description, null)
})

// ---- listing -------------------------------------------------------------

Deno.test('qk: an article missing its id, title or time is skipped', () => {
  assertEquals(parseQueerKalender('<article class="c-calendar-item"><h3 class="c-calendar-item__title">No time</h3></article>').length, 0)
  assertEquals(parseQueerKalender('<article class="c-calendar-item"><time datetime="2026-01-01T00:00:00+01:00"></time><div id="share-cal-1"></div></article>').length, 0)
})

Deno.test('qk: a repeated id stages once', () => {
  assertEquals(parseQueerKalender(ARTICLE + ARTICLE).length, 1)
})

Deno.test('qk: falls back to a canonical URL when the deeplink carries none', () => {
  const stripped = ARTICLE.replace(/&details=[^&"]*/g, '').replace(/\?body=[^&"]*/g, '?body=')
  const e = parseQueerKalender(stripped)[0]
  assertEquals(e.url, 'https://queer-kalender.nl/en/page/1225')
})

Deno.test('qk: event_type is inferred and on-vocabulary', () => {
  const LEGAL = new Set([
    'party', 'festival', 'pride', 'fetish', 'community', 'meetup', 'conference',
    'workshop', 'concert', 'film', 'drag', 'sports', 'art', 'theater',
    'fundraiser', 'protest', 'social', 'fair', 'cruise', 'comedy', 'exhibition', 'other',
  ])
  assertEquals(LEGAL.has(parseQueerKalender(ARTICLE)[0].eventType), true)
  const drag = parseQueerKalender(ARTICLE.replace('Bottoms up bar', 'Drag Bingo Night'))[0]
  assertEquals(drag.eventType, 'drag')
})
