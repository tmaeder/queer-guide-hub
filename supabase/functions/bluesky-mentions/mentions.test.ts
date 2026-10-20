import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { isBlocked, queerGuidePaths, quotesTitle } from './mentions.ts'

const post = (record: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  uri: 'at://did:plc:a/app.bsky.feed.post/1',
  author: { did: 'did:plc:a', handle: 'a.bsky.social' },
  record,
  ...extra,
})

Deno.test('queerGuidePaths reads link cards, facets and bare URLs; ignores other hosts', () => {
  const p = post({
    text: 'see https://queer.guide/venues/eagle and https://example.com/x',
    embed: { external: { uri: 'https://queer.guide/de/events/rio-pride-2026/' } },
    facets: [{ features: [{ uri: 'https://www.queer.guide/venues/eagle' }] }],
  })
  assertEquals(queerGuidePaths(p).sort(), ['/de/events/rio-pride-2026', '/venues/eagle'])
})

Deno.test('isBlocked: any adult/graphic or hide/warn label on the post, author or self-labels', () => {
  assertEquals(isBlocked(post({ text: 'x' })), false)
  assertEquals(isBlocked(post({ text: 'x' }, { labels: [{ val: 'porn' }] })), true)
  assertEquals(isBlocked(post({ text: 'x', labels: { values: [{ val: 'nudity' }] } })), true)
  assertEquals(isBlocked(post({ text: 'x' }, { author: { did: 'd', handle: 'h', labels: [{ val: '!hide' }] } })), true)
})

Deno.test('quotesTitle needs the whole title, ignoring case and accents', () => {
  assertEquals(quotesTitle(post({ text: 'Off to ZÜRICH pride 2026!' }), 'Zurich Pride 2026'), true)
  assertEquals(quotesTitle(post({ text: 'Zurich is lovely, pride in 2026' }), 'Zurich Pride 2026'), false)
})
