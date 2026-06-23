import { assertEquals } from 'jsr:@std/assert'
import { parseRssItems, parseItunesDuration } from '../source-rss-news/rss-parse.ts'

const PODCAST_ITEM = `<rss><channel>
<item>
  <title>Ep 12: Queer History Now</title>
  <link>https://pod.example/ep12</link>
  <itunes:summary>A conversation about LGBTQ+ archives and oral history.</itunes:summary>
  <pubDate>Mon, 23 Jun 2026 08:00:00 +0000</pubDate>
  <itunes:author>Jane Host</itunes:author>
  <itunes:duration>1:02:30</itunes:duration>
  <itunes:image href="https://pod.example/art.jpg"/>
  <enclosure url="https://cdn.example/ep12.mp3?aid=rss&amp;feed=X" length="42" type="audio/mpeg"/>
</item>
</channel></rss>`

const NEWS_ITEM = `<rss><channel>
<item>
  <title>Council passes equality ordinance</title>
  <link>https://news.example/story</link>
  <description>The measure protects LGBTQ+ residents.</description>
  <pubDate>Mon, 23 Jun 2026 08:00:00 +0000</pubDate>
  <enclosure url="https://news.example/photo.jpg" type="image/jpeg"/>
</item>
</channel></rss>`

Deno.test('parseRssItems — podcast mode extracts audio + duration + media_type', () => {
  const [item] = parseRssItems(PODCAST_ITEM, true)
  assertEquals(item.media_type, 'podcast')
  assertEquals(item.audio_url, 'https://cdn.example/ep12.mp3?aid=rss&feed=X') // &amp; decoded
  assertEquals(item.duration_seconds, 3750) // 1h 2m 30s
  assertEquals(item.image_url, 'https://pod.example/art.jpg')
  // show notes carried into content so the non-empty-content guard passes
  assertEquals((item.content as string).length > 0, true)
})

Deno.test('parseRssItems — podcast item with no audio enclosure is skipped', () => {
  const noAudio = PODCAST_ITEM.replace(/<enclosure[^>]*>/, '')
  assertEquals(parseRssItems(noAudio, true).length, 0)
})

Deno.test('parseRssItems — news mode does not set audio fields (no regression)', () => {
  const [item] = parseRssItems(NEWS_ITEM, false)
  assertEquals(item.media_type, undefined)
  assertEquals(item.audio_url, undefined)
  assertEquals(item.image_url, 'https://news.example/photo.jpg')
})

Deno.test('parseItunesDuration — formats', () => {
  assertEquals(parseItunesDuration('1:02:30'), 3750)
  assertEquals(parseItunesDuration('45:00'), 2700)
  assertEquals(parseItunesDuration('600'), 600)
  assertEquals(parseItunesDuration(null), null)
  assertEquals(parseItunesDuration('garbage'), null)
})
