/**
 * Unit tests for the pure existence-probe logic (JSON-LD verdicts, regex phrase
 * detection, http_status mapping). No network. Run with:
 *   cd supabase/functions && deno test _tests/existence-probe.test.ts
 */
import { assertEquals } from 'jsr:@std/assert'
import { parseJsonLdStatus, detectClosedPhrase, httpStatusSignal } from '../_shared/existence-probe.ts'

Deno.test('JSON-LD EventCancelled -> dead', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Event', eventStatus: 'https://schema.org/EventCancelled' })}</script>`
  assertEquals(parseJsonLdStatus(html)?.verdict, 'dead')
})

Deno.test('JSON-LD EventScheduled -> alive', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Event', eventStatus: 'https://schema.org/EventScheduled' })}</script>`
  assertEquals(parseJsonLdStatus(html)?.verdict, 'alive')
})

Deno.test('Product OutOfStock -> dying (not dead — restock is common)', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', offers: { availability: 'https://schema.org/OutOfStock' } })}</script>`
  assertEquals(parseJsonLdStatus(html)?.verdict, 'dying')
})

Deno.test('Product Discontinued -> dead', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', offers: { availability: 'https://schema.org/Discontinued' } })}</script>`
  assertEquals(parseJsonLdStatus(html)?.verdict, 'dead')
})

Deno.test('no JSON-LD -> null', () => {
  assertEquals(parseJsonLdStatus('<html><body>hello</body></html>'), null)
})

Deno.test('@graph is traversed', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'Event', eventStatus: 'EventPostponed' }] })}</script>`
  assertEquals(parseJsonLdStatus(html)?.verdict, 'dying')
})

Deno.test('regex detects permanently closed', () => {
  const r = detectClosedPhrase('<p>This venue is <b>permanently closed</b> as of 2026.</p>')
  assertEquals(r?.verdict, 'dead')
})

Deno.test('regex detects event ended', () => {
  const r = detectClosedPhrase('<div>This event has ended. Thanks for coming!</div>')
  assertEquals(r?.verdict, 'dead')
})

Deno.test('regex ignores normal copy', () => {
  assertEquals(detectClosedPhrase('Open daily 9am–5pm. Come visit us!'), null)
})

Deno.test('httpStatusSignal: broken -> dead, ok -> alive, blocked -> weak alive, timeout -> null', () => {
  assertEquals(httpStatusSignal('venue', 'x', 'broken')?.verdict, 'dead')
  assertEquals(httpStatusSignal('venue', 'x', 'ok')?.verdict, 'alive')
  assertEquals(httpStatusSignal('venue', 'x', 'blocked')?.verdict, 'alive')
  assertEquals(httpStatusSignal('venue', 'x', 'blocked')?.weight, 0.4)
  assertEquals(httpStatusSignal('venue', 'x', 'timeout'), null)
})
