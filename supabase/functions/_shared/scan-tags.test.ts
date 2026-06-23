import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { slugifyTag, tagLabel } from './scan-tags.ts'

Deno.test('slugifyTag lowercases and hyphenates', () => {
  assertEquals(slugifyTag('Drag Show'), 'drag-show')
  assertEquals(slugifyTag('  Leather / Fetish  '), 'leather-fetish')
})

Deno.test('slugifyTag strips diacritics (café → cafe, not caf)', () => {
  assertEquals(slugifyTag('Café'), 'cafe')
  assertEquals(slugifyTag('Zürich'), 'zurich')
})

Deno.test('slugifyTag returns empty for non-alphanumeric junk', () => {
  assertEquals(slugifyTag('   '), '')
  assertEquals(slugifyTag('!!!'), '')
})

Deno.test('tagLabel title-cases and preserves acronyms', () => {
  assertEquals(tagLabel('drag show'), 'Drag Show')
  assertEquals(tagLabel('lgbtq pride'), 'LGBTQ Pride')
  assertEquals(tagLabel('bipoc artists'), 'BIPOC Artists')
})
