import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { wikipediaProposal, pexelsProposal, imageProposal, refreshSource } from './refresh.ts'
const target = { id: '11111111-1111-4111-8111-111111111111', wikidata_qid: 'Q42', bio: 'Old biography' }
function wikiFetcher(override: Record<string, unknown> = {}): typeof fetch {
  return (url => Promise.resolve(Response.json(new URL(String(url)).hostname === 'www.wikidata.org'
    ? { entities: { Q42: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }] }, sitelinks: { enwiki: { title: 'Douglas Adams' } } } } }
    : { type: 'standard', wikibase_item: 'Q42', extract: 'A factual biography.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Douglas_Adams' } }, ...override }))) as typeof fetch
}
Deno.test('Wikipedia follows the existing human QID and queues only sourced biography text', async () => {
  assertEquals(await wikipediaProposal(target, wikiFetcher()), { field: 'bio', value: 'A factual biography.', source_url: 'https://en.wikipedia.org/wiki/Douglas_Adams', wikidata_qid: 'Q42' })
})
Deno.test('Wikipedia refuses mismatched identities, disambiguation, and unrelated article URLs', async () => {
  for (const override of [{ wikibase_item: 'Q123' }, { type: 'disambiguation' }, { content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Someone_Else' } } }])
    assertEquals(await wikipediaProposal(target, wikiFetcher(override)), null)
})
Deno.test('Wikipedia never searches unlinked names or imports nonhuman records', async () => {
  assertEquals(await wikipediaProposal({ name: 'Unknown', wikidata_qid: null }, (() => { throw Error('must not search') }) as typeof fetch), null)
  assertEquals(await wikipediaProposal(target, (() => Promise.resolve(Response.json({ entities: { Q42: { claims: {}, sitelinks: { enwiki: { title: 'Other' } } } } }))) as typeof fetch), null)
})
const photo = { id: 123, width: 1800, height: 1000, alt: 'Berlin city skyline Germany', photographer: 'Photographer', photographer_url: 'https://www.pexels.com/@photographer', url: 'https://www.pexels.com/photo/123', src: { large: 'https://images.pexels.com/photos/123/example.jpg' } }
Deno.test('Pexels suggestions retain attribution and place context', async () => {
  const result = await pexelsProposal({ name: 'Berlin', countries: { name: 'Germany' } }, 'private-key', ((url, init) => {
    assertEquals(new URL(String(url)).searchParams.get('query'), 'Berlin Germany city architecture')
    assertEquals(((init as { headers?: Record<string, string> })?.headers ?? {}).Authorization, 'private-key')
    return Promise.resolve(Response.json({ photos: [photo] }))
  }) as typeof fetch)
  assertEquals(result?.image_attribution, 'Photographer')
  assertEquals(result?.image_url, photo.src.large)
  assertEquals(result?.image_license, 'Pexels License')
})
Deno.test('Pexels refuses unrelated and untrusted image candidates', async () => {
  for (const change of [{ alt: 'Paris skyline' }, { src: { large: 'https://evil.example/image.jpg' } }])
    assertEquals(await pexelsProposal({ name: 'Berlin', countries: { name: 'Germany' } }, 'key', (() => Promise.resolve(Response.json({ photos: [{ ...photo, ...change }] }))) as typeof fetch), null)
})
Deno.test('Pexels rejected credentials identify the exact secret', async () => {
  await assertRejects(() => pexelsProposal({ name: 'Berlin', countries: { name: 'Germany' } }, 'key', (() => Promise.resolve(new Response('', { status: 401 }))) as typeof fetch), Error, 'PEXELS_API_KEY')
})
Deno.test('exhausted Pexels quota uses the existing Unsplash key with honest attribution', async () => {
  const calls: string[] = []
  const result = await imageProposal({ name: 'Berlin', countries: { name: 'Germany' } }, key => ({ PEXELS_API_KEY: 'pexels-key', UNSPLASH_ACCESS_KEY: 'unsplash-key' })[key], ((url, init) => {
    calls.push(new URL(String(url)).hostname)
    if (new URL(String(url)).hostname === 'api.pexels.com') return Promise.resolve(new Response('', { status: 429 }))
    assertEquals(((init as { headers?: Record<string, string> })?.headers ?? {}).Authorization, 'Client-ID unsplash-key')
    return Promise.resolve(Response.json({ results: [{ id: 'photo', alt_description: photo.alt, width: 1800, height: 1000,
      urls: { regular: 'https://images.unsplash.com/photo-123' }, user: { name: 'Unsplash photographer', links: { html: 'https://unsplash.com/@photographer' } }, links: { html: 'https://unsplash.com/photos/photo' } }] }))
  }) as typeof fetch)
  assertEquals(calls, ['api.pexels.com', 'api.unsplash.com'])
  assertEquals(result.fallback, true)
  assertEquals(result.proposed?.image_source, 'unsplash')
  assertEquals(result.proposed?.image_attribution, 'Unsplash photographer')
})
Deno.test('image refresh names alternative keys when neither provider is configured', async () => {
  await assertRejects(() => imageProposal({}, () => undefined, (() => { throw Error('must not fetch') }) as typeof fetch), Error, 'PEXELS_API_KEY, UNSPLASH_ACCESS_KEY')
})
function fake(prior = false) {
  const writes: Array<{ table: string; kind: string; value: unknown }> = []
  const reads: string[] = []
  const db = { from(table: string) {
    reads.push(table); let kind = 'read'
    const response = () => ({ error: null, data: kind === 'insert' ? { id: target.id } : table === 'personalities' ? [target] : table === 'ai_suggestions' ? (prior ? [{ id: target.id }] : []) : [{ id: target.id }] })
    const chain: Record<string, unknown> = { then(resolve: (v: unknown) => void) { return Promise.resolve(response()).then(resolve) }, single: () => Promise.resolve(response()) }
    for (const method of ['select','order','limit','not','or','gt','eq']) chain[method] = () => chain
    for (const method of ['insert','update']) chain[method] = (value: unknown) => { kind = method; writes.push({ table, kind, value }); return chain }
    return chain
  } } as unknown as SupabaseClient
  return { db, writes, reads }
}
const source = { id: target.id, slug: 'wikipedia', config: { operator_setting: true }, updated_at: '2026-11-19T00:00:00Z' }
Deno.test('weekly refresh stages pending suggestions and advances only its registry cursor', async () => {
  const { db, writes } = fake()
  const result = await refreshSource(db, source, { pipeline_run_id: 'parent' }, () => undefined, wikiFetcher())
  assertEquals(result.items_succeeded, 1)
  assertEquals(writes.map(w => [w.table, w.kind]), [['ai_suggestions', 'insert'], ['ingestion_sources', 'update']])
  assertEquals((writes[0].value as Record<string, unknown>).status, 'pending')
  assertEquals((writes[1].value as { config: unknown }).config, { operator_setting: true, weekly_refresh_cursor: target.id })
})
Deno.test('weekly refresh previews write neither suggestions nor cursors', async () => {
  const { db, writes } = fake()
  const result = await refreshSource(db, source, { dry_run: true }, () => undefined, wikiFetcher())
  assertEquals(result.items_total, 1)
  assertEquals(result.items_succeeded, 0)
  assertEquals(writes, [])
})
Deno.test('weekly refresh retries deduplicate already-reviewed suggestions', async () => {
  const { db, writes } = fake(true)
  const result = await refreshSource(db, source, {}, () => undefined, wikiFetcher())
  assertEquals(result.items_skipped, 1)
  assertEquals(writes.map(w => w.table), ['ingestion_sources'])
})
