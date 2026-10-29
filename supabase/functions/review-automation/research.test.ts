import test from 'node:test'
import assert from 'node:assert/strict'
import { recoverSources, sourceCandidates } from './research.ts'
import type { Context } from './policy.ts'

const context: Context = { item: { queue_type: 'event-quality', title: 'Example' }, record: null, proposal: null, related: {}, research: null, candidates: [], urls: [], input_hash: 'synthetic' }
const page = () => new Response('Publisher programme and exact venue address. '.repeat(10), { headers: { 'content-type': 'text/html' } })

test('recovers explicit publisher, staging, canonical and prior-research URLs without guessing from prose', () => {
  for (const patch of [
    { related: { publisher_sources: [{ source_url: 'https://example.org/event' }] } },
    { proposal: { source_content: { normalized: { website: 'https://example.org/event' }, enriched: null } } },
    { proposal: { source_content: { normalized: { urls: ['https://example.org/event'] }, enriched: null } } },
    { related: { venue_candidates: [{ website: 'https://example.org/event' }] } },
    { research: { candidates: [{ source_url: 'https://example.org/event' }] } },
    { record: { website: 'https://example.org/event' } },
  ]) assert.deepEqual(sourceCandidates({ ...context, ...patch }), ['https://example.org/event'])
  assert.deepEqual(sourceCandidates({ ...context, record: { description: 'Use https://example.org/event', name: 'example.org' } }), [])
})

test('normalized source URL arrays retain existing attempt bounds and reject nested metadata', async () => {
  const urls = sourceCandidates({ ...context, proposal: { source_content: { normalized: {
    urls: ['http://example.org/unsafe', 'https://localhost', { url: 'https://example.org/DO_NOT_FETCH' }, 'https://example.org/canonical', 'https://example.org/over-array-limit'],
    arbitrary_metadata: 'DO_NOT_EXPORT',
  } } } })
  assert.deepEqual(urls, ['https://example.org/canonical'])
  const result = await recoverSources({ ...context, proposal: { source_content: { normalized: { urls: ['https://example.org/canonical'] } } } }, async () => page())
  assert.equal(result.attempted, 1); assert.equal(result.evidence[0].url, 'https://example.org/canonical')
})

test('deduplicates fragments, validates destinations before fetch and bounds attempts', async () => {
  const calls: string[] = []
  const result = await recoverSources({ ...context, urls: ['http://example.org', 'https://localhost', 'https://reader@example.org', 'https://example.org:8443', 'https://example.org/a#one', 'https://example.org/a#two', ...['b','c','d','e'].map(x => `https://example.org/${x}`)] }, async url => {
    calls.push(String(url)); return new Response(null, { status: 404 })
  })
  assert.deepEqual(calls, ['a','b','c','d'].map(x => `https://example.org/${x}`))
  assert.equal(result.attempted, 4); assert.equal(result.errors.length, 4); assert.deepEqual(result.evidence, [])
})

test('bad publisher source falls back to canonical live source; captured text is never evidence', async () => {
  const calls: string[] = []
  const result = await recoverSources({ ...context, urls: ['https://example.org/dead'], related: { venue_candidates: [{ website: 'https://example.org/live' }], publisher_sources: [{ captured: { description: 'Old source text '.repeat(30) } }] } }, async url => {
    calls.push(String(url)); return String(url).endsWith('/dead') ? new Response(null, { status: 403 }) : page()
  })
  assert.equal(result.evidence.length, 1); assert.equal(result.evidence[0].url, 'https://example.org/live')
  assert.ok(Date.parse(result.evidence[0].retrieved_at)); assert.equal(result.errors.length, 1)
  assert.deepEqual(calls, ['https://example.org/dead', 'https://example.org/live'])
  const capturedOnly = await recoverSources({ ...context, related: { captured: { description: 'Old source text '.repeat(30) } } }, async () => { throw new Error('No network expected') })
  assert.equal(capturedOnly.attempted, 0); assert.deepEqual(capturedOnly.evidence, [])
})

test('retains at most two pages and rejects unsafe redirects without visiting them', async () => {
  let calls = 0
  const result = await recoverSources({ ...context, urls: ['a','b','c','d'].map(x => `https://example.org/${x}`) }, async () => {
    calls++; return calls === 1 ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }) : page()
  })
  assert.equal(calls, 3); assert.equal(result.evidence.length, 2); assert.equal(result.errors.length, 1)
})
