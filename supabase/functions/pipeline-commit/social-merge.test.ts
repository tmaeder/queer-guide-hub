import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { mergeSocialLinks } from './social-merge.ts'

Deno.test('adds a new key without touching existing ones', () => {
  assertEquals(
    mergeSocialLinks({ facebook: 'https://facebook.com/a' }, { instagram: 'https://instagram.com/a', facebook: 'https://facebook.com/OTHER' }),
    { facebook: 'https://facebook.com/a', instagram: 'https://instagram.com/a' },
  )
})

Deno.test('fills an empty value under an existing key (the key-count check skipped this)', () => {
  assertEquals(mergeSocialLinks({ facebook: '' }, { facebook: 'https://facebook.com/a' }), {
    facebook: 'https://facebook.com/a',
  })
})

Deno.test('existing curated value wins over a different incoming value', () => {
  assertEquals(mergeSocialLinks({ twitter: 'https://x.com/curated' }, { twitter: 'https://x.com/scraped' }), null)
})

Deno.test('no change returns null; empty/blank incoming is ignored', () => {
  assertEquals(mergeSocialLinks({ facebook: 'https://facebook.com/a' }, { facebook: 'https://facebook.com/a' }), null)
  assertEquals(mergeSocialLinks({}, { facebook: '  ' }), null)
  assertEquals(mergeSocialLinks(null, null), null)
})

Deno.test('null existing is treated as empty', () => {
  assertEquals(mergeSocialLinks(null, { instagram: 'https://instagram.com/a' }), { instagram: 'https://instagram.com/a' })
})
