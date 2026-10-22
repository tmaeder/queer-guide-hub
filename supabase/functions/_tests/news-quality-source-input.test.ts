import { assert, assertEquals, assertStrictEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { readStagedNewsInput } from '../pipeline-quality-enhance/staging-input.ts'
import { attemptNewsQuality } from '../pipeline-quality-enhance/quality-attempt.ts'
import { buildQualityUserPrompt } from '../_shared/news-quality/prompts.ts'
import { parseQualityDecision } from '../_shared/news-quality/schema.ts'

Deno.test('normalized RSS retains body, publisher and URL beyond the short excerpt', () => {
  const description = 'Source paragraph. '.repeat(50) + 'Evidence beyond the excerpt limit.'
  const input = readStagedNewsInput({
    name: 'Community episode', description,
    urls: ['https://podcasters.spotify.com/pod/show/community/episodes/one'],
    sourceName: 'Community publisher',
    metadata: { excerpt: description, media_type: 'podcast' },
  })
  assertEquals(input.title, 'Community episode')
  assertEquals(input.content, description)
  const prompt = buildQualityUserPrompt({ ...input, body: input.content })
  assert(prompt.includes('Evidence beyond the excerpt limit.'))
  assert(prompt.includes('Source: <user_data>Community publisher</user_data>'))
  assert(prompt.includes('URL: <user_data>https://podcasters.spotify.com/'))
})

Deno.test('legacy explicit article fields retain priority over adapter fallbacks', () => {
  assertEquals(readStagedNewsInput({
    title: 'Explicit title', name: 'Fallback', content: 'Full article', description: 'Summary',
    url: 'https://example.org/article', urls: ['https://example.org/other'],
    source_name: 'Explicit publisher', sourceName: 'Fallback publisher', excerpt: 'Explicit excerpt',
  }), {
    title: 'Explicit title', content: 'Full article', excerpt: 'Explicit excerpt',
    url: 'https://example.org/article', sourceName: 'Explicit publisher',
  })
})

Deno.test('blank legacy values fall through to actual normalized source data', () => {
  const input = readStagedNewsInput({ title: ' ', name: 'RSS title', content: '', body: '',
    description: 'Available RSS text', url: '', metadata: { url: 'https://example.org/episode', source_name: 'RSS outlet' } })
  assertEquals(input.title, 'RSS title')
  assertEquals(input.content, 'Available RSS text')
  assertEquals(input.url, 'https://example.org/episode')
  assertEquals(input.sourceName, 'RSS outlet')
})

Deno.test('metadata excerpt is not invented as an article body', () => {
  const input = readStagedNewsInput({ metadata: { excerpt: 'Only a short excerpt' } })
  assertEquals(input.content, '')
  assertEquals(input.excerpt, 'Only a short excerpt')
})

Deno.test('extracted markdown is retained before a short RSS description', () => {
  const markdown = 'Original article paragraph. '.repeat(35) + 'Full-page evidence retained.'
  const input = readStagedNewsInput({ name: 'Source article', content: '', body: ' ',
    markdown, description: 'Short RSS summary' })
  assertEquals(input.content, markdown)
  assertEquals(input.excerpt, 'Short RSS summary')
  assert(buildQualityUserPrompt({ ...input, body: input.content }).includes('Full-page evidence retained.'))
})

Deno.test('invalid or blank markdown falls back to the actual RSS description', () => {
  for (const markdown of ['', ' ', [], { content: 'Not source text' }]) {
    assertEquals(readStagedNewsInput({ markdown, description: 'Original RSS text' }).content, 'Original RSS text')
  }
})

Deno.test('invalid fields and private source URLs do not become fetch targets', () => {
  const input = readStagedNewsInput({ title: {}, content: [], url: 'http://127.0.0.1/private',
    urls: ['https://user:secret@example.org/private'], metadata: { url: 'https://example.org/public' } })
  assertEquals(input.title, '')
  assertEquals(input.content, '')
  assertEquals(input.url, 'https://example.org/public')
})

Deno.test('unavailable provider defers without requesting a verdict', async () => {
  let calls = 0
  const result = await attemptNewsQuality(() => Promise.resolve(false), () => { calls++; return Promise.resolve(null) })
  assertEquals(result, { kind: 'deferred', reason: 'service_unavailable' })
  assertEquals(calls, 0)
  assert(!('decision' in result))
})

Deno.test('provider and availability failures defer without manufacturing a review decision', async () => {
  const failure = new Error('Provider temporarily unavailable')
  const result = await attemptNewsQuality(() => Promise.resolve(true), () => Promise.reject(failure))
  assertEquals(result.kind, 'deferred')
  assert(!('decision' in result))
  if (result.kind === 'deferred') assertStrictEquals(result.error, failure)
  const unavailable = await attemptNewsQuality(() => Promise.reject(failure), () => Promise.resolve(null))
  assertEquals(unavailable.kind, 'deferred')
})

Deno.test('real quality decisions retain their fields and confidence unchanged', async () => {
  const decision = parseQualityDecision('{"title":"Source title","cleanedBody":"Source text","confidence":0.22,"needsManualReview":true}')
  assert(decision)
  const result = await attemptNewsQuality(() => Promise.resolve(true), () => Promise.resolve(decision))
  assert(result.kind === 'decision')
  assertStrictEquals(result.decision, decision)
  assertEquals(result.decision.confidence, 0.22)
  assertEquals(result.decision.needsManualReview, true)
})

Deno.test('a malformed response remains distinct from an unavailable provider', async () => {
  assertEquals(await attemptNewsQuality(() => Promise.resolve(true), () => Promise.resolve(null)), { kind: 'malformed' })
})
