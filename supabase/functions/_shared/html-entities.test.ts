import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { decodeEntities, decodeEntitiesDeep, stripTagsAndDecode } from './html-entities.ts'

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

Deno.test('entities: extra table is merged, exact case wins over lowercase', () => {
  const extra = { AElig: 'Æ', aelig: 'æ', uuml: 'ü' }
  assertEquals(decodeEntities('&AElig; &aelig;', extra), 'Æ æ')
  assertEquals(decodeEntities('S&uuml;dpol', extra), 'Südpol')
  // Defaults still apply alongside the extra table.
  assertEquals(decodeEntities('a &amp; b', extra), 'a & b')
})

Deno.test('deep: recovers a double-encoded entity (eventfrog really needs this)', () => {
  const extra = { uuml: 'ü', ndash: '–' }
  assertEquals(decodeEntitiesDeep('S&amp;uuml;dpol', extra), 'Südpol')
  assertEquals(decodeEntitiesDeep('a &amp;ndash; b', extra), 'a – b')
})

Deno.test('deep: the second pass REFUSES markup-producing entities', () => {
  // The whole point: recover &amp;uuml; without also turning &amp;lt; into '<'.
  assertEquals(decodeEntitiesDeep('&amp;lt;'), '&lt;')
  assertEquals(decodeEntitiesDeep('&amp;gt;'), '&gt;')
  assertEquals(decodeEntitiesDeep('&amp;amp;'), '&amp;')
  assertEquals(decodeEntitiesDeep('&amp;quot;'), '&quot;')
  assertEquals(decodeEntitiesDeep('&amp;lt;script&amp;gt;'), '&lt;script&gt;')
})

Deno.test('deep: numerics are excluded from the second pass entirely', () => {
  // &#38; and &#60; are the same hazard with a different spelling.
  assertEquals(decodeEntitiesDeep('&amp;#60;'), '&#60;')
  assertEquals(decodeEntitiesDeep('&amp;#38;lt;'), '&#38;lt;')
})

Deno.test('deep: an extra entry that yields markup is still refused on pass two', () => {
  // A caller table cannot smuggle a '<' past the second pass.
  assertEquals(decodeEntitiesDeep('&amp;evil;', { evil: '<' }), '&evil;')
})

Deno.test('entities: whitespace is collapsed and trimmed by stripTagsAndDecode', () => {
  assertEquals(stripTagsAndDecode('  a\n\n  b  '), 'a b')
  assertEquals(stripTagsAndDecode(''), '')
})
