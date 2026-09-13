import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { cleanText, excerptOf, extractChannelImage, extractChannelMeta, extractMediaUrl, parseRssItems, stripLoneSurrogates } from './rss-parse.ts'

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

// Item COUNT does not bound the work; item SIZE does. The 2026-08-06 21:00 run
// died (HTTP 546, 11s) on a 2.35 MB / 111-item feed: the 100-item cap applied,
// the 4 MB read cap never fired, but the items average ~21 KB and cleanText is
// a 4-pass strip/decode loop, so it still faced ~8 MB of string work.
Deno.test('parseRssItems stops once the text budget is spent, even under maxItems', () => {
  const fat = (i: number) =>
    `<item><title>Ep ${i}</title><link>https://x/${i}</link>` +
    `<description>${'x'.repeat(100_000)}</description></item>`
  const xml = `<rss><channel>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(fat).join('')}</channel></rss>`
  // 10 items x 100 KB, cap 100 items, but only ~250 KB of text allowed.
  const out = parseRssItems(xml, false, 100, 250_000)
  assertEquals(out.length < 10, true, `expected the text budget to bite, got ${out.length}`)
  assertEquals(out.length >= 1, true, 'must still return the items it could afford')
})

Deno.test('parseRssItems text budget does not truncate ordinary feeds', () => {
  // 20 small items are nowhere near the default budget.
  assertEquals(parseRssItems(feedWith(20)).length, 20)
})

// Regression: content and excerpt both derive from the same description, and
// cleanText (the parser's most expensive call) used to run twice per item.
Deno.test('excerpt is derived from the same cleaned text as content', () => {
  const xml =
    '<rss><channel><item><title>T</title><link>https://x/1</link>' +
    `<description>&lt;p&gt;${'word '.repeat(200)}&lt;/p&gt;</description></item></channel></rss>`
  const [item] = parseRssItems(xml)
  assertEquals(String(item.excerpt), excerptOf(String(item.content)))
})

// ── Audio enclosures must never become artwork ─────────────────────────────
//
// extractMediaUrl's fallback took the first <enclosure url="..."> with NO type
// check, so on a podcast item — where the enclosure IS the audio — every
// episode stored its own .mp3 as its image. Measured on prod 2026-09-08:
// 5,607 news_articles (5,548 mp3 + 52 m4a + 1 wav + 6 mp4), 2,405 of them
// seo_indexable and therefore publishing an MP3 as og:image to crawlers.

Deno.test('extractMediaUrl never returns an audio enclosure', () => {
  const block = '<title>Ep 1</title>' +
    '<enclosure url="https://www.buzzsprout.com/218346/episodes/17604553-ep-351.mp3" length="42" type="audio/mpeg"/>'
  assertEquals(extractMediaUrl(block), null)
})

Deno.test('extractMediaUrl accepts an enclosure that DECLARES an image type', () => {
  // The point of the fallback: a real image whose URL carries no extension.
  const block = '<enclosure url="https://cdn.example/asset/9f2c1a?w=1200" type="image/jpeg"/>'
  assertEquals(extractMediaUrl(block), 'https://cdn.example/asset/9f2c1a?w=1200')
})

Deno.test('extractMediaUrl rejects a TYPELESS enclosure — absence of a type is not evidence of an image', () => {
  assertEquals(extractMediaUrl('<enclosure url="https://cdn.example/mystery" length="9"/>'), null)
})

Deno.test('extractMediaUrl scans ALL enclosures, not just the first', () => {
  // Matching the first enclosure and then testing it is a different bug with
  // the same symptom: the image is present but sits behind the audio.
  const block =
    '<enclosure url="https://cdn.example/ep.mp3" type="audio/mpeg"/>' +
    '<enclosure url="https://cdn.example/art" type="image/png"/>'
  assertEquals(extractMediaUrl(block), 'https://cdn.example/art')
})

// ── Channel artwork ────────────────────────────────────────────────────────

const CHANNEL_ART = 'https://cdn.example/show-cover.jpg'
const EPISODE_ART = 'https://cdn.example/episode-cover.jpg'

function podcastFeed(itemInner: string): string {
  return '<rss><channel><title>Show</title>' +
    `<itunes:image href="${CHANNEL_ART}"/>` +
    `<item><title>Ep 1</title><link>https://x/1</link><description>notes</description>${itemInner}</item>` +
    '</channel></rss>'
}

const AUDIO = '<enclosure url="https://cdn.example/ep1.mp3" type="audio/mpeg"/>'

Deno.test('extractChannelImage reads the channel header', () => {
  assertEquals(extractChannelImage(podcastFeed(AUDIO)), CHANNEL_ART)
})

Deno.test('extractChannelImage does NOT adopt an item-level itunes:image as the show artwork', () => {
  // The scoping trap: an unscoped regex finds the FIRST episode's art and
  // stamps it on every other episode — wrong for exactly the feeds that
  // bother with per-episode artwork.
  const noChannelArt =
    '<rss><channel><title>Show</title>' +
    `<item><title>Ep 1</title><link>https://x/1</link><itunes:image href="${EPISODE_ART}"/></item>` +
    '</channel></rss>'
  assertEquals(extractChannelImage(noChannelArt), null)
})

Deno.test('extractChannelImage ignores RSS <image><url> — that is the site logo, not artwork', () => {
  const logoOnly =
    '<rss><channel><title>Show</title><image><url>https://cdn.example/88x31.gif</url></image>' +
    '<item><title>Ep</title><link>https://x/1</link></item></channel></rss>'
  assertEquals(extractChannelImage(logoOnly), null)
})

Deno.test('a podcast episode with no art of its own falls back to the SHOW artwork, never the audio', () => {
  const [item] = parseRssItems(podcastFeed(AUDIO), true)
  assertEquals(item.image_url, CHANNEL_ART)
  assertEquals(item.audio_url, 'https://cdn.example/ep1.mp3')
})

Deno.test('per-episode art outranks the show artwork', () => {
  const [item] = parseRssItems(podcastFeed(`${AUDIO}<itunes:image href="${EPISODE_ART}"/>`), true)
  assertEquals(item.image_url, EPISODE_ART)
})

Deno.test('a NEWS feed never inherits channel artwork — one logo on every article is worse than none', () => {
  const [item] = parseRssItems(podcastFeed(''), false)
  assertEquals(item.image_url, null)
})

// ── Item URL: a guid is not a URL ────────────────────────────────────────────
//
// `<link>` is OPTIONAL on a podcast item, and the two biggest hosts fill the
// gap with their own primary key. The parser used to take `<guid>` whenever
// `<link>` was absent, so that key landed in news_articles.url and
// pipeline-validate rejected the row with E_INVALID_URL — 323 of 680 podcast
// rejections in a 30-day window, every episode of several ACTIVE shows, every
// day, while source health stayed green because the FETCH succeeded.

const MEGAPHONE_ITEM = `<rss><channel><title>Attitudes!</title>
<itunes:image href="https://cdn.example/show.jpg"/>
<item>
  <title>Egypt Blocks LuPone Gay Cruise Too</title>
  <guid isPermaLink="false">f5c534fe-3e17-11f1-810f-3bc0d47f51c8</guid>
  <description>Show notes for this episode of the programme.</description>
  <enclosure url="https://traffic.megaphone.fm/SBP3317243526.mp3" type="audio/mpeg"/>
</item>
</channel></rss>`

const BUZZSPROUT_ITEM = `<rss><channel><title>Sounds Fake But Okay</title>
<itunes:image href="https://cdn.example/show.jpg"/>
<item>
  <title>Ep 396: Reddit Rabbithole pt. 26</title>
  <guid>Buzzsprout-19685709</guid>
  <description>Show notes for this episode of the programme.</description>
  <enclosure url="https://www.buzzsprout.com/1952385/19685709.mp3" type="audio/mpeg"/>
</item>
</channel></rss>`

Deno.test('a Megaphone UUID guid never becomes the episode URL — the audio does', () => {
  const [item] = parseRssItems(MEGAPHONE_ITEM, true)
  assertEquals(item.url, 'https://traffic.megaphone.fm/SBP3317243526.mp3')
  assertEquals(new URL(item.url as string).protocol, 'https:')
})

Deno.test('a Buzzsprout-NNNN guid never becomes the episode URL — the audio does', () => {
  const [item] = parseRssItems(BUZZSPROUT_ITEM, true)
  assertEquals(item.url, 'https://www.buzzsprout.com/1952385/19685709.mp3')
})

Deno.test('an episode with NO <link> is no longer dropped', () => {
  // The old guard was `if (!title || !link) continue`. Once the guid stopped
  // standing in for a link, an unguarded version of this change would have
  // deleted these items outright instead of rejecting them downstream — a
  // worse failure, because it leaves nothing to audit.
  assertEquals(parseRssItems(MEGAPHONE_ITEM, true).length, 1)
})

Deno.test('a real <link> still wins over the audio enclosure', () => {
  const withLink = MEGAPHONE_ITEM.replace(
    '<guid isPermaLink="false">',
    '<link>https://attitudes.example/ep/241</link><guid isPermaLink="false">',
  )
  assertEquals(parseRssItems(withLink, true)[0].url, 'https://attitudes.example/ep/241')
})

Deno.test('isPermaLink="true" is honoured, but only when the value really is a URL', () => {
  const realPermalink = BUZZSPROUT_ITEM.replace(
    '<guid>Buzzsprout-19685709</guid>',
    '<guid isPermaLink="true">https://sfbo.example/396</guid>',
  )
  assertEquals(parseRssItems(realPermalink, true)[0].url, 'https://sfbo.example/396')

  // Some feeds declare isPermaLink="true" over a urn:uuid:. The ATTRIBUTE is a
  // claim; the parse is the evidence.
  const lyingPermalink = BUZZSPROUT_ITEM.replace(
    '<guid>Buzzsprout-19685709</guid>',
    '<guid isPermaLink="true">urn:uuid:f5c534fe-3e17-11f1-810f</guid>',
  )
  assertEquals(parseRssItems(lyingPermalink, true)[0].url, 'https://www.buzzsprout.com/1952385/19685709.mp3')
})

Deno.test('the NEWS branch is unchanged — a non-URL guid still stages, so its verdict is recorded', () => {
  // Deliberately NOT "improved". A news feed that has always published a bare
  // guid keeps reaching pipeline-validate and keeps getting E_INVALID_URL on a
  // row someone can look at. Silently dropping it here would be a regression
  // dressed up as a fix.
  const newsWithGuidOnly = `<rss><channel><item>
    <title>Council passes equality ordinance</title>
    <guid>tag:example.com,2026:12345</guid>
    <description>Body text of the report goes here.</description>
  </item></channel></rss>`
  assertEquals(parseRssItems(newsWithGuidOnly, false)[0].url, 'tag:example.com,2026:12345')
})

// ── Channel metadata ─────────────────────────────────────────────────────────

Deno.test('extractChannelMeta reads blurb and website from the channel header only', () => {
  const feed = `<rss><channel>
    <title>Show</title>
    <link>https://show.example</link>
    <description>A show about &lt;b&gt;queer&lt;/b&gt; history.</description>
    <itunes:image href="https://cdn.example/show.jpg"/>
    <item>
      <title>Ep 1</title>
      <link>https://show.example/1</link>
      <description>Episode-level blurb that must NOT become the show blurb.</description>
      <enclosure url="https://cdn.example/1.mp3" type="audio/mpeg"/>
    </item>
  </channel></rss>`
  const meta = extractChannelMeta(feed)
  assertEquals(meta.description, 'A show about queer history.')
  assertEquals(meta.link, 'https://show.example')
  assertEquals(meta.image, 'https://cdn.example/show.jpg')
})

Deno.test('extractChannelMeta returns null for a bare-domain channel link', () => {
  const feed = '<rss><channel><title>S</title><link>show.example</link>' +
    '<item><title>E</title><enclosure url="https://c/1.mp3" type="audio/mpeg"/></item></channel></rss>'
  assertEquals(extractChannelMeta(feed).link, null)
})

Deno.test('extractChannelImage still behaves exactly as before', () => {
  const feed = '<rss><channel><itunes:image href="https://cdn.example/show.jpg"/>' +
    '<item><title>E</title><link>https://x/1</link></item></channel></rss>'
  assertEquals(extractChannelImage(feed), 'https://cdn.example/show.jpg')
})
