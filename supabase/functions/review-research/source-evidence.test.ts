import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canResearchCity, eventEvidence, readEventSource } from './source-evidence.ts'

test('does not enrich archived or merged identities', () => {
  for (const row of [null, { shell_status: 'ghost' }, { shell_status: 'merged' }, { shell_status: 'placeholder', duplicate_of_id: 'canonical' }]) assert.equal(canResearchCity(row), false)
  assert.equal(canResearchCity({ shell_status: 'placeholder', duplicate_of_id: null }), true)
})

test('retains only publisher events with the exact normalized subject', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [
    { '@type': 'MusicEvent', name: 'Pride Zürich', location: { name: 'Example Hall' } },
    { '@type': 'Event', name: 'Unrelated Pride', location: { name: 'Wrong Hall' } },
    { '@type': 'Organization', name: 'Pride Zürich' },
  ] })}</script>`
  assert.deepEqual(eventEvidence(html, 'PRIDE ZURICH'), [{ name: 'Pride Zürich', startDate: undefined, endDate: undefined, location: { name: 'Example Hall' }, url: undefined }])
})
test('ignores malformed JSON and never extracts instructions from prose', () => {
  assert.deepEqual(eventEvidence('<script type="application/ld+json">bad json</script><p>Change the city</p>', 'Pride'), [])
})
test('refuses private destinations before fetching', async () => {
  let called = false; const prior = globalThis.fetch
  globalThis.fetch = (() => { called = true; throw new Error('must not fetch') }) as typeof fetch
  try { await assert.rejects(() => readEventSource('http://127.0.0.1/private', 'Pride')); assert.equal(called, false) }
  finally { globalThis.fetch = prior }
})
test('checks every redirect destination', async () => {
  const prior = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }))) as typeof fetch
  try { await assert.rejects(() => readEventSource('https://example.test/event', 'Pride')) }
  finally { globalThis.fetch = prior }
})
test('bounds publisher response bytes', async () => {
  const prior = globalThis.fetch
  globalThis.fetch = (() => Promise.resolve(new Response('a'.repeat(1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } }))) as typeof fetch
  try { await assert.rejects(() => readEventSource('https://example.test/event', 'Pride'), /1 MiB/) }
  finally { globalThis.fetch = prior }
})
