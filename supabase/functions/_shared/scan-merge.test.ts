import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { mergeExtractedItems, itemKey, type MergeItem } from './scan-merge.ts'

const f = (value: unknown) => ({ value, confidence: 0.9 })
const ev = (title: string, start: string, extra: Record<string, unknown> = {}, tags: string[] = []): MergeItem => ({
  detected_type: 'event',
  fields: { title: f(title), start_date: f(start), ...extra },
  raw_tags: tags,
})

Deno.test('dedupes events by title + start day across chunks', () => {
  const out = mergeExtractedItems([
    ev('Pride Party', '2026-07-01T20:00:00Z'),
    ev('Pride Party', '2026-07-01T21:30:00Z'), // same day → duplicate
    ev('Pride Party', '2026-07-08T20:00:00Z'), // next week → distinct
  ])
  assertEquals(out.length, 2)
})

Deno.test('fills missing fields from a later duplicate and unions tags', () => {
  const out = mergeExtractedItems([
    ev('Show', '2026-07-01', {}, ['drag']),
    ev('Show', '2026-07-01', { venue_name: f('Club X') }, ['techno']),
  ])
  assertEquals(out.length, 1)
  assertEquals((out[0].fields.venue_name as { value: string }).value, 'Club X')
  assertEquals(out[0].raw_tags.sort(), ['drag', 'techno'])
})

Deno.test('drops untitled and empty items', () => {
  const out = mergeExtractedItems([
    { detected_type: 'event', fields: {}, raw_tags: [] },
    { detected_type: 'venue', fields: { name: f('') }, raw_tags: [] },
    { detected_type: 'venue', fields: { name: f('Bar Y') }, raw_tags: [] },
  ])
  assertEquals(out.length, 1)
  assertEquals((out[0].fields.name as { value: string }).value, 'Bar Y')
})

Deno.test('venue and hotel share a key namespace; caps at maxItems', () => {
  assertEquals(
    itemKey({ detected_type: 'hotel', fields: { name: f('A') }, raw_tags: [] }),
    'venue|a',
  )
  const many = Array.from({ length: 80 }, (_, i) => ev(`E${i}`, '2026-07-01'))
  assertEquals(mergeExtractedItems(many, 60).length, 60)
})
