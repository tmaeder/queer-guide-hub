import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { decodeEntities, stripTagsAndDecode } from './html-entities.ts'

Deno.test('entities: decodes the named set', () => {
  assertEquals(decodeEntities('Bear &amp; Bar'), 'Bear & Bar')
  assertEquals(decodeEntities('&lt;tag&gt;'), '<tag>')
  assertEquals(decodeEntities('&quot;q&quot; &apos;a&apos;'), '"q" \'a\'')
  assertEquals(decodeEntities('a&nbsp;b'), 'a b')
})

Deno.test('entities: decodes numeric and hex forms', () => {
  assertEquals(decodeEntities('Cura&#231;ao'), 'Curaçao')
  assertEquals(decodeEntities('Cura&#xe7;ao'), 'Curaçao')
  assertEquals(decodeEntities('&#x1F389;'), '🎉')
  assertEquals(decodeEntities('&#0039;'), "'")
})

Deno.test('entities: NO DOUBLE-DECODING — this is the vulnerability', () => {
  // js/double-escaping (high). A chained implementation decodes &#38; to '&'
  // in the numeric pass, and the later &lt; -> '<' pass then re-reads the
  // result and emits a literal '<' — smuggling a tag past a stripper that
  // has already run. One pass means output is never re-scanned.
  assertEquals(decodeEntities('&#38;lt;'), '&lt;')
  assertEquals(decodeEntities('&amp;lt;'), '&lt;')
  assertEquals(decodeEntities('&amp;#60;'), '&#60;')
  assertEquals(decodeEntities('&#38;#38;lt;'), '&#38;lt;')
})

Deno.test('entities: a smuggled tag cannot survive strip-then-decode', () => {
  // The order in stripTagsAndDecode matters as much as the single pass:
  // strip first, decode second, so a decoded '<' can never form a tag.
  assertEquals(stripTagsAndDecode('a &#38;lt;script&#38;gt; b'), 'a &lt;script&gt; b')
  assertEquals(stripTagsAndDecode('<b>bold</b> &amp; <i>it</i>'), 'bold & it')
})

Deno.test('entities: an unknown entity is returned verbatim, not dropped', () => {
  assertEquals(decodeEntities('&frobnicate;'), '&frobnicate;')
  assertEquals(decodeEntities('AT&T'), 'AT&T')
  assertEquals(decodeEntities('a & b'), 'a & b')
})

Deno.test('entities: malformed or out-of-range code points survive as text', () => {
  assertEquals(decodeEntities('&#999999999;'), '&#999999999;')
  assertEquals(decodeEntities('&#xD800;'), '&#xD800;') // lone surrogate
  assertEquals(decodeEntities('&#;'), '&#;')
  assertEquals(decodeEntities('&;'), '&;')
})

Deno.test('entities: whitespace is collapsed and trimmed by stripTagsAndDecode', () => {
  assertEquals(stripTagsAndDecode('  a\n\n  b  '), 'a b')
  assertEquals(stripTagsAndDecode(''), '')
})
