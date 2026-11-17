import { assertEquals, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { isStarObserverFeed, parseStarObserverSyndication, STAR_OBSERVER_SYNDICATION } from './star-observer.ts'

const now = Date.parse('2026-11-17T12:00:00Z')
const article = 'https://www.starobserver.com.au/news/publisher-story/245184'
const item = (url = article, date = 'Mon, 16 Nov 2026 17:57:00 GMT') => `<item><title>Publisher story</title><link>${url.replaceAll('&', '&amp;')}</link><pubDate>${date}</pubDate><description>Published syndicated excerpt.</description></item>`
const feed = (...items: string[]) => `<rss><channel>${items.join('')}</channel></rss>`

Deno.test('Star Observer syndication preserves publisher links, dates and excerpt provenance', () => {
  const wrapped = 'http://www.bing.com/news/apiclick.aspx?ref=FexRss&url=' + encodeURIComponent(article + '?tracking=1#section')
  const rows = parseStarObserverSyndication(feed(item(wrapped), item(article)), 10, now)
  assertEquals(rows.length, 1)
  assertEquals(rows[0].url, article)
  assertEquals(rows[0].published_at, '2026-11-16T17:57:00.000Z')
  assertEquals(rows[0].content, 'Published syndicated excerpt.')
  assertEquals(rows[0].content_scope, 'syndicated_excerpt')
  assertEquals(rows[0].syndication_url, STAR_OBSERVER_SYNDICATION)
})
Deno.test('Star Observer rejects unrelated URLs, forged wrappers, missing dates and stale results', () => {
  for (const xml of [feed(item('https://www.starobserver.com.au.evil.example/news/story/123456')), feed(item('https://evil.example/news/apiclick.aspx?url='+encodeURIComponent(article))), feed(item('https://user:password@www.starobserver.com.au/news/story/123456')), feed(item('https://www.starobserver.com.au/contact-us')), feed(item(article, 'invalid')), feed(item(article, 'Mon, 16 Nov 2020 17:57:00 GMT')), feed(item(article, 'Mon, 23 Nov 2026 17:57:00 GMT')), '<html>Challenge</html>', '<rss><channel/></rss>']) {
    assertThrows(() => parseStarObserverSyndication(xml, 10, now))
  }
})
Deno.test('Star Observer selection is exact and imports remain bounded', () => {
  assertEquals(isStarObserverFeed('https://www.starobserver.com.au/feed/'), true)
  for (const url of ['https://www.starobserver.com.au/feed/?private=1', 'http://www.starobserver.com.au/feed/', 'https://www.starobserver.com.au/feed/#other', 'https://user@www.starobserver.com.au/feed/']) assertEquals(isStarObserverFeed(url), false)
  assertEquals(parseStarObserverSyndication(feed(item(), item(article.replace('245184','245185'))), 1, now).length, 1)
})
