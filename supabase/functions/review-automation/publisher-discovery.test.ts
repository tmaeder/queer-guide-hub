import { assertEquals } from 'jsr:@std/assert'
import { discoverPublisherEvidence, eventPublisherDate, publisherTarget } from './publisher-discovery.ts'
import type { Context } from './policy.ts'

const context: Context = {
  item: { queue_type: 'event-quality', title: 'Synthetic review' },
  record: { id: '00000000-0000-0000-0000-000000000001', title: 'Queer Film Night', start_date: '2026-11-19' },
  related: { location: { city: 'Basel' } }, proposal: null, research: null, urls: [], input_hash: 'hash',
  candidates: [{ id: 'category_film', action: 'approve', explanation: 'Verified film event', payload: {} }],
}
const row = { source_slug: 'qcal', source_url: 'https://qcal.app/event/queer-film-night-basel' }
const html = '<p>Queer Film Night</p><p>Basel</p><p>2026-11-19</p>' + '<p>Live programme and public cinema details. '.repeat(6)
const fetchPage = (body: string) => (() => Promise.resolve(new Response(body, { headers: { 'Content-Type': 'text/html' } }))) as typeof fetch

Deno.test('only allowlisted public record types and exact catalogue foreign keys are eligible', () => {
  assertEquals(publisherTarget(context)?.foreignKey, 'event_id')
  assertEquals(publisherTarget({ ...context, blocker: 'protected_review' }), null)
  assertEquals(publisherTarget({ ...context, item: { ...context.item, queue_type: 'staging' } }), null)
  const venue = { ...context, item: { ...context.item, queue_type: 'quality-venue' },
    record: { id: context.record?.id, name: 'Public Cinema', seo_indexable: true } }
  assertEquals(publisherTarget(venue)?.foreignKey, 'venue_id')
  assertEquals(publisherTarget({ ...venue, record: { ...venue.record, seo_indexable: false } }), null)
  assertEquals(publisherTarget({ ...venue, record: { ...venue.record, duplicate_of_id: 'other' } }), null)
})

Deno.test('a newly fetched publisher detail page must name the subject, city and exact occurrence', async () => {
  const target = { ...publisherTarget(context)!, date: '2026-11-19' }
  assertEquals((await discoverPublisherEvidence(target, [row], [], fetchPage(html))).evidence?.url, row.source_url)
  assertEquals((await discoverPublisherEvidence(target, [row], [], fetchPage(html.replace('2026-11-19', '2025-11-19')))).evidence, null)
  assertEquals((await discoverPublisherEvidence(target, [row], [], fetchPage(html.replace('Basel', 'Geneva')))).evidence, null)
  assertEquals((await discoverPublisherEvidence(target, [row], [], fetchPage(html.replace('Queer Film Night', 'Another Film Night')))).evidence, null)
})

Deno.test('wrong hosts, directory pages, query strings and cross-host redirects cannot be fetched', async () => {
  const target = { ...publisherTarget(context)!, date: '2026-11-19' }
  let calls = 0
  const fetcher = (() => {
    calls++
    return Promise.resolve(new Response(null, { status: 302, headers: { Location: 'https://evil.example/event/film' } }))
  }) as typeof fetch
  const denied = ['https://qcal.app.evil.example/event/film', 'https://qcal.app/', 'https://qcal.app/event/film?token=secret', 'https://qcal.app/event/foo%2fbar']
    .map(source_url => ({ ...row, source_url }))
  const r = await discoverPublisherEvidence(target, [...denied, row], [], fetcher)
  assertEquals(r, { evidence: null, attempted: 1, unavailable: 1 })
  assertEquals(calls, 1)
})

Deno.test('duplicate evidence is skipped and at most two new detail pages are read', async () => {
  const target = { ...publisherTarget(context)!, date: '2026-11-19' }
  const urls = ['first', 'second', 'third'].map(path => ({ ...row, source_url: 'https://qcal.app/event/' + path }))
  const existing = [{ url: row.source_url, retrieved_at: new Date().toISOString(), text: html }]
  const r = await discoverPublisherEvidence(target, [row, ...urls], existing, fetchPage(html.replace('Basel', 'Geneva')))
  assertEquals(r, { evidence: null, attempted: 2, unavailable: 0 })
})

Deno.test('publisher occurrence uses the event local date and refuses unknown timezone', () => {
  assertEquals(eventPublisherDate('2026-11-19T02:00:00+00:00', 'America/New_York'), '2026-11-18')
  assertEquals(eventPublisherDate('2026-11-19T02:00:00+00:00', null), null)
  assertEquals(eventPublisherDate('2026-11-19', null), '2026-11-19')
})
