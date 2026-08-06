import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { cleanText, excerptOf, extractMediaUrl, parseRssItems, stripLoneSurrogates } from './rss-parse.ts'

// Regression: parseRssItems used to build EVERY item in the feed, and the
// caller sliced to maxArticles afterwards. Each item runs cleanText (a 4-pass
// strip/decode loop), so a 652-episode podcast archive burned ~60s of CPU to
// keep 100 items and killed the edge worker with HTTP 546 — which took the
// whole news pipeline down for three days (2026-08-03 → 2026-08-06).
function feedWith(n: number): string {
  const items = Array.from({ length: n }, (_, i) =>
    `<item><title>Episode ${i}</title><link>https://example.com/${i}</link>` +
    `<description>${'very long show notes '.repeat(50)}</description></item>`
  ).join('')
  return `<rss><channel>${items}</channel></rss>`
}

Deno.test('parseRssItems stops at maxItems instead of parsing the whole feed', () => {
  assertEquals(parseRssItems(feedWith(500), false, 10).length, 10)
})

Deno.test('parseRssItems returns the NEWEST items — RSS is newest-first, so the prefix', () => {
  const out = parseRssItems(feedWith(500), false, 3)
  assertEquals(out.map((i) => i.title), ['Episode 0', 'Episode 1', 'Episode 2'])
})

Deno.test('parseRssItems is unbounded when no cap is given (existing callers unchanged)', () => {
  assertEquals(parseRssItems(feedWith(120)).length, 120)
})

Deno.test('parseRssItems: a zero/negative cap yields nothing rather than everything', () => {
  assertEquals(parseRssItems(feedWith(20), false, 0).length, 0)
})

// The cap counts items actually PUSHED. Podcast entries without an audio
// enclosure are skipped, and must not consume the budget — otherwise a feed
// whose first entries lack audio would return short.
Deno.test('parseRssItems: skipped podcast items do not consume the cap', () => {
  const noAudio = `<item><title>No audio</title><link>https://x/a</link><description>d</description></item>`
  const withAudio = (i: number) =>
    `<item><title>Ep ${i}</title><link>https://x/${i}</link><description>d</description>` +
    `<enclosure url="https://x/${i}.mp3" type="audio/mpeg"/></item>`
  const xml = `<rss><channel>${noAudio.repeat(5)}${[1, 2, 3, 4].map(withAudio).join('')}</channel></rss>`
  const out = parseRssItems(xml, true, 3)
  assertEquals(out.length, 3)
  assertEquals(out.map((i) => i.title), ['Ep 1', 'Ep 2', 'Ep 3'])
})

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

// A lone surrogate cannot be encoded as UTF-8. `ingestion_staging.raw_data` is
// JSONB, so Postgres rejects the INSERT outright:
//   22P02 invalid input syntax for type json
//   DETAIL: Unicode low surrogate must follow a high surrogate.
// The staging write is one batch, so a single bad character throws away every
// item in the run — that is how the 2026-08-06 19:00 run died in 7s with all 8
// of its sources already fetched successfully.
Deno.test('excerptOf never orphans half a surrogate pair at the cut', () => {
  // 499 chars then an emoji: the 500-char cut lands BETWEEN its two halves.
  const s = 'a'.repeat(499) + '😀' + 'tail'
  const out = excerptOf(s)
  assertEquals(out, 'a'.repeat(499))
  // The real assertion: what we emit must survive a UTF-8 round trip, which is
  // what the JSONB insert does. A lone surrogate becomes U+FFFD instead.
  assertEquals(new TextDecoder().decode(new TextEncoder().encode(out)), out)
})

Deno.test('excerptOf keeps an emoji that fits wholly inside the cut', () => {
  const s = 'a'.repeat(400) + '😀'
  assertEquals(excerptOf(s), 'a'.repeat(400) + '😀')
})

Deno.test('stripLoneSurrogates removes an orphan high surrogate', () => {
  const bad = 'hello\uD83Dworld'
  assertEquals(stripLoneSurrogates(bad), 'helloworld')
})

Deno.test('stripLoneSurrogates removes an orphan LOW surrogate', () => {
  const bad = 'hello\uDE00world'
  assertEquals(stripLoneSurrogates(bad), 'helloworld')
})

Deno.test('stripLoneSurrogates leaves valid pairs intact', () => {
  const good = 'pride 🏳️‍🌈 and 😀 emoji'
  assertEquals(stripLoneSurrogates(good), good)
})

Deno.test('stripLoneSurrogates is empty-safe', () => {
  assertEquals(stripLoneSurrogates(''), '')
})

// cleanText is the funnel every text field passes through, so a feed that
// SHIPS a lone surrogate (mojibake upstream) is neutralised there too — the
// slice is only one of the two ways one can reach the payload.
Deno.test('cleanText strips a feed-supplied lone surrogate', () => {
  const out = cleanText('Pride march \uD83D report')
  assertEquals(new TextDecoder().decode(new TextEncoder().encode(out)), out)
  assertEquals(out.includes('\uD83D'), false)
})
