import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { isHuffPostQueerFeed, huffPostSectionLinks, parseHuffPostArticle, fetchHuffPostQueerSection } from './huffpost.ts'

const link = (i: number, unit = 'main') => `<a class="card__headline" data-vars-unit-name="${unit}" data-vars-subunit-name="zone_feed" href="https://www.huffpost.com/entry/story-${i}?tracking=1">Story</a>`
const article = '<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","headline":"Original headline","datePublished":"2026-11-17T12:30:00Z","description":"Publisher excerpt","author":{"@type":"Person","name":"Reporter"}}]}</script>'

Deno.test('HuffPost fallback is confined to the registered Queer Voices feed', () => {
  assertEquals(isHuffPostQueerFeed('https://www.huffpost.com/section/queer-voices/feed'), true)
  assertEquals(isHuffPostQueerFeed('https://chaski.huffpost.com/us/auto/vertical/queer-voices'), true)
  for (const url of ['https://www.huffpost.com/section/politics/feed', 'https://www.huffpost.com.evil.example/section/queer-voices/feed']) assertEquals(isHuffPostQueerFeed(url), false)
})

Deno.test('HuffPost section discovery excludes advertising and removes tracking', () => {
  assertEquals(huffPostSectionLinks(link(0, 'top_ad') + link(1) + link(1) + link(2), 1), ['https://www.huffpost.com/entry/story-1'])
})

Deno.test('HuffPost articles retain actual metadata and reject undated content', () => {
  const parsed = parseHuffPostArticle(article, 'https://www.huffpost.com/entry/original')!
  assertEquals([parsed.title, parsed.author, parsed.published_at, parsed.url], ['Original headline', 'Reporter', '2026-11-17T12:30:00Z', 'https://www.huffpost.com/entry/original'])
  assertEquals(parseHuffPostArticle(article.replace('2026-11-17T12:30:00Z', 'unknown'), 'https://www.huffpost.com/entry/original'), null)
})

Deno.test('HuffPost fallback fetches at most three articles even for a large feed request', async () => {
  const seen: string[] = []
  const result = await fetchHuffPostQueerSection(100, url => { seen.push(url); return Promise.resolve(url.endsWith('queer-voices') ? Array.from({ length: 20 }, (_, i) => link(i)).join('') : article) })
  assertEquals(seen.length, 4)
  assertEquals(result.items.length, 3)
})
