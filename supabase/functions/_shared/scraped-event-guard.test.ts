import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { scrapedEventRejectReason } from './scraped-event-guard.ts'

Deno.test('eventfrog promo tile is rejected even with a date', () => {
  assertEquals(
    scrapedEventRejectReason({ title: 'Fehlt dein Event?', start_date: '2026-11-01T06:00:07Z' }),
    'promo_placeholder',
  )
})

Deno.test('English promo tiles are rejected', () => {
  for (const t of ['Add your event', 'Submit an event', 'Is your event missing?', 'List your event here']) {
    assertEquals(scrapedEventRejectReason({ title: t, start_date: '2026-11-01' }), 'promo_placeholder', t)
  }
})

Deno.test('an item without a usable date is rejected, never dated by the scraper clock', () => {
  assertEquals(scrapedEventRejectReason({ title: 'Pride Party' }), 'no_start_date')
  assertEquals(scrapedEventRejectReason({ title: 'Pride Party', start_date: '' }), 'no_start_date')
  assertEquals(scrapedEventRejectReason({ title: 'Pride Party', start_date: 'soon' }), 'no_start_date')
})

Deno.test('a real dated event passes, including titles that merely contain "event"', () => {
  assertEquals(scrapedEventRejectReason({ title: 'Pride Party', start_date: '2026-11-07T22:00:00Z' }), null)
  assertEquals(scrapedEventRejectReason({ title: 'Event Horizon Rave', start_date: '2026-11-07' }), null)
  assertEquals(scrapedEventRejectReason({ name: 'Queer Brunch', start_date: '2026-11-08' }), null)
})
