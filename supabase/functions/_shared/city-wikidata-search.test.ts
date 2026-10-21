import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { searchCityQid } from './city-wikidata-search.ts'
Deno.test('search transport failure stays retryable instead of becoming no candidate', async () => {
  await assertRejects(() => searchCityQid('Zürich', 'Switzerland', async () => ({ ok: false })), Error, 'wikidata_search_unavailable')
})
Deno.test('API error and malformed successful response are not absence of evidence', async () => {
  for (const data of [{ error: { code: 'maxlag' } }, {}, null, { search: null }]) {
    await assertRejects(() => searchCityQid('Zürich', 'Switzerland', async () => ({ ok: true, data })), Error, 'wikidata_search_invalid_response')
  }
})
Deno.test('only a successfully read empty candidate set is a no-match result', async () => {
  assertEquals(await searchCityQid('Example', null, async () => ({ ok: true, data: { search: [] } })), null)
})
Deno.test('municipality candidates prefer the supplied country, including Italian spelling', async () => {
  const result = await searchCityQid('Bastia', 'Italy', async () => ({ ok: true, data: { search: [
    { id: 'Q1', description: 'town in France' },
    { id: 'Q20126', description: 'comune of Italy' },
    { id: 'invalid', description: 'city in Italy' },
  ] } }))
  assertEquals(result, 'Q20126')
})
Deno.test('malformed identifiers are never returned as candidates', async () => {
  assertEquals(await searchCityQid('Example', null, async () => ({ ok: true, data: { search: [{ id: 'https://example.org', description: 'town' }] } })), null)
})
