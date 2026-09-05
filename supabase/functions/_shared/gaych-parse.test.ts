import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { extractCategoryKeywords } from './gaych-parse.ts'

// The plain shape the site is expected to emit.
Deno.test('reads the label out of a category anchor', () => {
  const html = '<a href="/de/parties?c=1" class="link-category" rel="nofollow">Zürich</a>'
  assertEquals(extractCategoryKeywords(html), ['Zürich'])
})

Deno.test('reads several, in document order, and keeps real punctuation', () => {
  const html = `
    <a href="/a" class="link-category" rel="nofollow">Zürich</a>
    <a href="/b" class="link-category" rel="nofollow">Street Parade</a>
    <a href="/c" class="link-category" rel="nofollow">Lila - Queer Festival</a>`
  assertEquals(extractCategoryKeywords(html), ['Zürich', 'Street Parade', 'Lila - Queer Festival'])
})

// REGRESSION. Whatever the page does, no value may be stored that still looks
// like markup. Prod carried `class="link-category" rel="nofollow">Zürich` in
// 2,699 rows, so this is the exact string the old extractor produced.
Deno.test('never emits a value containing attribute soup', () => {
  const shapes = [
    // (a) the class string appears entity-encoded inside an attribute, which is
    //     where the unanchored pattern used to start matching
    '<div data-tpl="&lt;a class=&quot;link-category&quot; rel=&quot;nofollow&quot;&gt;Zürich&lt;/a&gt;">' +
      '</div><a href="/x" class="link-category" rel="nofollow">Bern</a>',
    // (b) a wrapper carrying the same class before the real anchor
    '<li class="link-category"><a href="/y" class="link-category" rel="nofollow">Basel</a></li>',
    // (c) the encoded anchor nested INSIDE a real one
    '<a href="/z" class="link-category">&lt;a class=&quot;link-category&quot; ' +
      'rel=&quot;nofollow&quot;&gt;Luzern&lt;/a&gt;</a>',
  ]
  for (const html of shapes) {
    for (const kw of extractCategoryKeywords(html)) {
      assertEquals(/[<>]/.test(kw), false, `angle bracket in: ${kw}`)
      assertEquals(/\b(class|rel|href)\s*=/i.test(kw), false, `attribute in: ${kw}`)
    }
  }
})

Deno.test('recovers the label from the wrapper shape rather than dropping it', () => {
  // (b) above must still yield the city — the refusal is for soup, not a reason
  // to lose a good label.
  const html = '<li class="link-category"><a href="/y" class="link-category" rel="nofollow">Basel</a></li>'
  assertEquals(extractCategoryKeywords(html), ['Basel'])
})

Deno.test('decodes entities before stripping, so revealed markup is still removed', () => {
  // This is the ordering fault: strip-then-decode leaves the decoded tag behind.
  const html = '<a href="/x" class="link-category">&lt;b&gt;Genf&lt;/b&gt;</a>'
  assertEquals(extractCategoryKeywords(html), ['Genf'])
})

Deno.test('decodes the entities a Swiss label actually needs', () => {
  const html = '<a href="/x" class="link-category">Z&#252;ri F&#228;scht &amp; Pride</a>'
  assertEquals(extractCategoryKeywords(html), ['Züri Fäscht & Pride'])
})

Deno.test('ignores anchors that are not category links', () => {
  const html = '<a href="/x" class="link-other" rel="nofollow">Not a category</a>'
  assertEquals(extractCategoryKeywords(html), [])
})

Deno.test('drops empty and whitespace-only labels', () => {
  const html = '<a href="/x" class="link-category"></a><a href="/y" class="link-category">   </a>'
  assertEquals(extractCategoryKeywords(html), [])
})
