import { assertEquals, assertRejects } from 'jsr:@std/assert'
import { discoverStagedNews, discoverStagedVenue, stagedDiscoveryId, stagedTarget } from './staged-discovery.ts'
import type { Context } from './policy.ts'

const id = '00000000-0000-0000-0000-000000000001'
const ctx: Context = {
  item: { queue_type: 'staging', title: 'Synthetic' }, proposal: { id, entity_type: 'venue' },
  record: null, related: {}, research: null, urls: [], input_hash: 'hash',
  candidates: [{ id: 'reject', action: 'reject', payload: {}, explanation: 'Only with evidence' }],
}
const stagedVenue = { source_name: 'gaybasel', source_type: 'gaybasel', target_table: 'venues',
  source_entity_id: 'venue-157', normalized_data: { name: 'Public Cinema', location: { city: 'Basel' } } }
const venue = { kind: 'venue', id: '157', name: 'Public Cinema', city: 'Basel' } as const
const news = { kind: 'news', id, name: 'An exact publisher headline',
  url: 'https://publisher.example/news/article?utm_source=rss&#038;utm_medium=rss' } as const
const registry = { url: 'https://publisher.example/feed', source_type: 'rss', is_active: true, auto_paused: false }
const article = '<h1>An exact publisher headline</h1>' + '<p>Source article text and reported public facts.</p>'.repeat(5)
const response = (value: string) => new Response(value, { headers: { 'Content-Type': 'text/html' } })

Deno.test('staging discovery requires the authorized context, exact source type and a usable identifier', () => {
  assertEquals(stagedDiscoveryId(ctx), id)
  assertEquals(stagedDiscoveryId({ ...ctx, blocker: 'source_not_authorized' }), null)
  assertEquals(stagedDiscoveryId({ ...ctx, candidates: [] }), null)
  assertEquals(stagedTarget(stagedVenue), venue)
  assertEquals(stagedTarget({ ...stagedVenue, source_type: 'community' }), null)
  assertEquals(stagedTarget({ ...stagedVenue, source_entity_id: 'venue-157/../666' }), null)
})

Deno.test('RSS recovery removes tracking and reads the exact publisher headline, not snippets or aggregators', async () => {
  const calls: string[] = []
  const fetcher = ((u: URL) => { calls.push(u.href); return Promise.resolve(response(article)) }) as typeof fetch
  assertEquals((await discoverStagedNews(news, registry, [], fetcher))?.url, 'https://publisher.example/news/article')
  assertEquals(await discoverStagedNews(news, { ...registry, auto_paused: true }, [], fetcher), null)
  assertEquals(await discoverStagedNews({ ...news, url: 'https://news.google.com/rss/articles/some-id' }, registry, [], fetcher), null)
  assertEquals(await discoverStagedNews({ ...news, url: 'https://other.example/news/article' }, registry, [], fetcher), null)
  assertEquals(calls, ['https://publisher.example/news/article'])
  assertEquals(await discoverStagedNews({ ...news, name: 'Another story' }, registry, [], fetcher), null)
})

Deno.test('RSS recovery refuses redirects outside the registered publisher', async () => {
  let calls = 0
  const fetcher = (() => {
    calls++
    return Promise.resolve(new Response(null, { status: 302, headers: { Location: 'https://other.example/news/article' } }))
  }) as typeof fetch
  await assertRejects(() => discoverStagedNews(news, registry, [], fetcher), Error, 'Publisher origin changed')
  assertEquals(calls, 1)
})

Deno.test('venue recovery uses the unique matching sitemap ID and a real detail page', async () => {
  const good = 'https://www.gaybasel.org/locations/157/cinema'
  const sitemap = `<loc>https://www.gaybasel.org/locations/158/other</loc><loc>https://other.example/locations/157/evil</loc><loc>${good}</loc>`
  const detail = '<p>Zurück zur Übersicht</p><h1>Public Cinema</h1><h2>Adresse</h2><p>Public Cinema</p><p>Mainstrasse 1</p><p>4000 Basel</p>'
  const calls: string[] = []
  const fetcher = ((u: URL, init: RequestInit) => {
    assertEquals(init.redirect, 'error')
    calls.push(u.href)
    return Promise.resolve(response(u.pathname === '/sitemap.xml' ? sitemap : detail))
  }) as typeof fetch
  assertEquals((await discoverStagedVenue(venue, fetcher))?.url, good)
  assertEquals(await discoverStagedVenue({ ...venue, city: 'Geneva' }, fetcher), null)
  assertEquals(await discoverStagedVenue({ ...venue, id: '1000' }, fetcher), null)
  assertEquals(calls.filter(u => u === good).length, 2)
  const soft404 = ((u: URL) => Promise.resolve(response(u.pathname === '/sitemap.xml' ? sitemap : 'Homepage with Public Cinema Basel'))) as typeof fetch
  assertEquals(await discoverStagedVenue(venue, soft404), null)
})
