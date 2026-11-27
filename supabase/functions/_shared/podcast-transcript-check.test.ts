import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { checkTranscriptBatch, checkTranscriptLink } from './podcast-transcript-check.ts'
const link = { url: 'https://publisher.test/42.txt', scope: 'episode' as const, source: 'feed' as const }
const mock = (response: () => Response) => (() => Promise.resolve(response())) as typeof fetch

Deno.test('transcript probes: 404/410, soft errors, editing pages and media are excluded', async () => {
  for (const status of [404, 410]) assertEquals((await checkTranscriptLink(link, mock(() => new Response('missing', { status })))).state, 'unavailable')
  assertEquals((await checkTranscriptLink(link, mock(() => new Response('<title>Page not found</title>')))).state, 'unavailable')
  assertEquals((await checkTranscriptLink(link, mock(() => new Response('audio', { headers: { 'content-type': 'audio/mpeg' } })))).state, 'unavailable')
  assertEquals((await checkTranscriptLink(link, mock(() => new Response('')))).state, 'unavailable')
})

Deno.test('transcript probes: bot blocks and transient failures are not treated as removals', async () => {
  for (const status of [403, 429, 503]) assertEquals((await checkTranscriptLink(link, mock(() => new Response('blocked', { status })))).state, 'unknown')
  assertEquals((await checkTranscriptLink(link, mock(() => new Response('<title>Just a moment...</title>')))).state, 'unknown')
  assertEquals((await checkTranscriptLink(link, (() => Promise.reject(new Error('timeout'))) as typeof fetch)).state, 'unknown')
})

Deno.test('transcript probes: bounded redirects cannot reach private URLs', async () => {
  assertEquals((await checkTranscriptLink(link, mock(() => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })))).state, 'unavailable')
  let calls = 0
  const result = await checkTranscriptLink(link, mock(() => ++calls === 1
    ? new Response(null, { status: 302, headers: { location: '/42-current.txt' } })
    : new Response('Speaker: Transcript text.')))
  assertEquals(result.state, 'available')
  assertEquals(calls, 2)
})

Deno.test('transcript probes: batch budgets defer work and deduplicate shared archive URLs', async () => {
  let calls = 0
  const items = [
    { id: '1', source_hash: 'a', links: [link] },
    { id: '2', source_hash: 'b', links: [link] },
    { id: '3', source_hash: 'c', links: [{ ...link, url: 'https://publisher.test/43.txt' }] },
    { id: '4', source_hash: 'd', links: [] },
  ]
  const result = await checkTranscriptBatch(items, 1, mock(() => { calls++; return new Response('missing', { status: 404 }) }))
  assertEquals(calls, 1)
  assertEquals(result.deferred, 1)
  assertEquals(result.items.map((r) => r.id), ['1', '2', '4'])
  assertEquals(result.items.every((r) => r.links.length === 0), true)
})
