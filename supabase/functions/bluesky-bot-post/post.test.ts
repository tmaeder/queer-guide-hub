import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildPost, hashtagFor, pickHashtags } from './post.ts'

const base = {
  entity_type: 'event' as const,
  entity_id: '00000000-0000-0000-0000-000000000001',
  title: 'Zürich Pride 2026',
  summary: 'Parade  and\nfestival.',
  path: '/events/zurich-pride-2026',
  tags: ['pride', 'Trans Rights', '2026', 'x'],
}

Deno.test('hashtagFor keeps one-word tags and camel-cases phrases', () => {
  assertEquals(hashtagFor('pride'), 'pride')
  assertEquals(hashtagFor('Trans Rights'), 'TransRights')
  assertEquals(hashtagFor('2026'), null)
  assertEquals(hashtagFor('x'), null)
})

Deno.test('buildPost: link card, two hashtags, facets on UTF-8 byte offsets', () => {
  const p = buildPost(base, new Date('2026-10-20T00:00:00Z'))
  assertEquals(p.text, 'Zürich Pride 2026 #pride #TransRights')
  assertEquals(p.embed.external.uri, 'https://queer.guide/events/zurich-pride-2026')
  assertEquals(p.embed.external.description, 'Parade and festival.')
  const bytes = new TextEncoder().encode(p.text)
  const slice = (f: { index: { byteStart: number; byteEnd: number } }) =>
    new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd))
  assertEquals(p.facets!.map(slice), ['#pride', '#TransRights'])
})

Deno.test('buildPost stays within 300 graphemes', () => {
  const p = buildPost({ ...base, title: 'é'.repeat(400) })
  const n = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(p.text)].length
  assertEquals(n <= 300, true)
  assertEquals(p.text.includes('…'), true)
})

Deno.test('pickHashtags puts specific tags before broad identity tags', () => {
  assertEquals(pickHashtags(['gay', 'pride', 'lgbtqia+']), ['pride', 'gay'])
  assertEquals(pickHashtags(['queer', 'drag', 'trans-rights']), ['drag', 'transRights'])
  assertEquals(pickHashtags(['gay', 'lgbtqia+']), ['gay', 'lgbtqia'])
  assertEquals(pickHashtags(null), [])
})
