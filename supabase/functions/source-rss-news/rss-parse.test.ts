import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { cleanText, extractMediaUrl } from './rss-parse.ts'

// Regression: the old cleanText stripped only `<`/`>`, leaving tag guts as
// visible text ("figure class=…", "pThe headline/p"). The state-machine strip
// must remove WHOLE tags instead.
Deno.test('cleanText removes whole tags, not just angle brackets', () => {
  const input =
    '<figure class="wp-block-image size-large"><img src="https://x/y.jpg" decoding="async" width="1544"/></figure><p>The Grand Final has sold out already&#8230;</p>'
  const out = cleanText(input)
  assertEquals(/figure|class=|decoding=|wp-block|<|>/.test(out), false, out)
  assertEquals(out.includes('The Grand Final has sold out already'), true, out)
})

Deno.test('cleanText decodes entity-encoded tags', () => {
  assertEquals(cleanText('&lt;p&gt;Hello &amp; welcome&lt;/p&gt;').trim(), 'Hello & welcome')
})

Deno.test('cleanText decodes numeric entities', () => {
  assertEquals(cleanText('Kristi Noem &#038; the read'), 'Kristi Noem & the read')
})

Deno.test('cleanText strips trailing WordPress "The post…" junk', () => {
  assertEquals(cleanText('Body text. The post My Title appeared first on My Site.').trim(), 'Body text.')
})

Deno.test('cleanText is empty-safe', () => {
  assertEquals(cleanText(''), '')
})

// Regression: media:content/enclosure URLs kept the feed's `&amp;` entities
// (846 stored image_urls), which browsers then ORB-block. Both branches must
// decode like extractItunesImage does.
Deno.test('extractMediaUrl decodes &amp; in media:content URLs', () => {
  const block =
    '<media:content url="https://i.guim.co.uk/img/media/x/2422.jpg?width=140&amp;quality=85&amp;s=abc" type="image/jpeg"/>'
  assertEquals(
    extractMediaUrl(block),
    'https://i.guim.co.uk/img/media/x/2422.jpg?width=140&quality=85&s=abc',
  )
})

Deno.test('extractMediaUrl decodes &amp; in enclosure URLs', () => {
  const block = '<enclosure url="https://example.com/pic?a=1&amp;b=2" type="image/jpeg"/>'
  assertEquals(extractMediaUrl(block), 'https://example.com/pic?a=1&b=2')
})
