import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { stripRawTextElements, stripCodeResidue, detectCodeResidue } from './code-residue.ts'
import { sanitizeArticle, stripHtmlTags } from './sanitize.ts'

// ---------------------------------------------------------------------------
// stripRawTextElements — the root-cause fix
// ---------------------------------------------------------------------------

Deno.test('stripRawTextElements drops a <style> element WITH its stylesheet', () => {
  const html = '<p>Real prose.</p><style>#wrap { color: red !important; }</style><p>More.</p>'
  const out = stripRawTextElements(html)
  assert(!out.includes('color: red'), out)
  assert(out.includes('Real prose.'))
  assert(out.includes('More.'))
})

Deno.test('stripRawTextElements drops <script> including > and < inside it', () => {
  const html = '<p>Prose.</p><script>if (a > b && c < d) { go(); }</script><p>Tail.</p>'
  const out = stripRawTextElements(html)
  assert(!out.includes('go()'), out)
  assert(out.includes('Prose.') && out.includes('Tail.'))
})

Deno.test('stripRawTextElements does not match tags that merely share a prefix', () => {
  const html = '<span>kept</span><section>also kept</section>'
  const out = stripRawTextElements(html)
  assert(out.includes('kept') && out.includes('also kept'))
})

Deno.test('stripRawTextElements: self-closing svg does not swallow the article', () => {
  const html = '<svg viewBox="0 0 1 1"/><p>Everything after must survive.</p>'
  assert(stripRawTextElements(html).includes('Everything after must survive.'))
})

Deno.test('stripRawTextElements: unterminated <script> drops only the tag', () => {
  const html = '<script src="x.js"><p>Body text survives.</p>'
  assert(stripRawTextElements(html).includes('Body text survives.'))
})

Deno.test('stripHtmlTags no longer leaks stylesheet text', () => {
  const out = stripHtmlTags('<p>Lead.</p><style>.a{color:red}</style>')
  assert(!out.includes('color:red'), out)
  assert(out.includes('Lead.'))
})

// ---------------------------------------------------------------------------
// stripCodeResidue — cleanup of already-tag-stripped bodies
// ---------------------------------------------------------------------------

// Verbatim shape of the leak reported on /news/brighton-pride-saturday-highlights…
const ATTITUDE = 'See here for the full Brighton Pride Sunday lineup and performance times. ' +
  '#att-unique-wrapper-2026 { all: initial !important; display: block !important; ' +
  'margin: 20px 0 !important; } #att-unique-wrapper-2026 * { box-sizing: border-box !important; } ' +
  '.att-title-new strong { font-weight: 800 !important; } ' +
  '@media (max-width: 480px) { #att-unique-wrapper-2026 { padding: 10px !important; } ' +
  '.att-link-btn { font-size: 10px !important; } }'

Deno.test('stripCodeResidue removes the injected stylesheet and keeps the sentence', () => {
  const { text, removed } = stripCodeResidue(ATTITUDE)
  assert(removed)
  assertEquals(
    text.replace(/\s+/g, ' ').trim(),
    'See here for the full Brighton Pride Sunday lineup and performance times.',
  )
})

Deno.test('stripCodeResidue removes a Shopify buy-button IIFE', () => {
  const input = "Available wherever books are sold. (function () { var scriptURL = " +
    "'https://sdks.shopifycdn.com/buy-button.js'; if (window.ShopifyBuy) { ShopifyBuyInit(); } " +
    "else { loadScript(); } })();"
  const { text } = stripCodeResidue(input)
  assertEquals(text.replace(/\s+/g, ' ').trim(), 'Available wherever books are sold.')
})

Deno.test('stripCodeResidue removes an embed call with an object literal argument', () => {
  const input = "I Saw the TV Glow (2024) window.videoEmbeds.push({ elemId: 'video-1', " +
    "data: {\"slug\":\"abc\"}, videoPlayerType: 'in-content' }); Jane Shoenbrun wrote it."
  const { text } = stripCodeResidue(input)
  assert(text.includes('I Saw the TV Glow (2024)'), text)
  assert(text.includes('Jane Shoenbrun wrote it.'), text)
  assert(!text.includes('videoPlayerType'), text)
})

Deno.test('stripCodeResidue is a no-op on text with no braces', () => {
  const prose = 'Brighton Pride returned with a bang celebrating its 35th anniversary.'
  assertEquals(stripCodeResidue(prose), { text: prose, removed: false })
})

// Regressions found by replaying the scrubber over the 174 live articles that
// contain a `{`. Each of these ate real prose before the guard that follows it.

Deno.test('a JS keyword that is also an English word must not start a head', () => {
  // `for`, `in`, `of` were in the head vocabulary and swallowed the sentence.
  const input = 'Attitude has reached out to Labour for comment. #wrap { color: red; }'
  assertEquals(
    stripCodeResidue(input).text.replace(/\s+/g, ' ').trim(),
    'Attitude has reached out to Labour for comment.',
  )
})

Deno.test('prose inside braces is not a code block', () => {
  // Two sources use `{Editor's Note: …}` as a house style for editorial asides.
  const input = "The ruling is here. {Editor's Note: Several links have been added for study, " +
    'but we recommend the full reference list provided by the author.}'
  assertEquals(stripCodeResidue(input), { text: input, removed: false })
})

Deno.test('inline LaTeX is not a call with an object argument', () => {
  const input = 'complexity of \\(O({n}^{3})\\), where n represents the sample size'
  assertEquals(stripCodeResidue(input), { text: input, removed: false })
})

Deno.test('a class selector survives the sentence-punctuation guard', () => {
  const input = 'Intro. .att-title-new { font-weight: 800; }'
  assertEquals(stripCodeResidue(input).text.replace(/\s+/g, ' ').trim(), 'Intro.')
})

// ---------------------------------------------------------------------------
// detectCodeResidue — the monitoring / publish-gate signal
// ---------------------------------------------------------------------------

Deno.test('detectCodeResidue flags css and js, ignores clean prose', () => {
  assert(detectCodeResidue('#x { color: red !important; }'))
  assert(detectCodeResidue('document.getElementById("a")'))
  assert(detectCodeResidue('@media (max-width: 480px) { }'))
  assert(!detectCodeResidue('RuPaul stunned the crowds with a 50-minute DJ set.'))
  assert(!detectCodeResidue('Vδ2 T cells have B cell helper function (Caccamo et al., 2006).'))
})

// ---------------------------------------------------------------------------
// End to end through the sanitizer
// ---------------------------------------------------------------------------

Deno.test('sanitizeArticle strips a <style> block and reports it clean', () => {
  const r = sanitizeArticle({
    title: 'Brighton Pride Saturday highlights',
    content: '<p>RuPaul stunned the crowds with a 50-minute DJ set.</p>' +
      '<style>#att-unique-wrapper-2026 { all: initial !important; }</style>',
  })
  assertEquals(r.content, 'RuPaul stunned the crowds with a 50-minute DJ set.')
  assertEquals(r.codeResidue, false)
  assert(r.removedArtifacts.includes('html_tags'))
})

Deno.test('sanitizeArticle cleans a legacy body whose tags are already gone', () => {
  const r = sanitizeArticle({ title: 'x', content: ATTITUDE })
  assertEquals(r.content, 'See here for the full Brighton Pride Sunday lineup and performance times.')
  assert(r.removedArtifacts.includes('code_residue'))
  assertEquals(r.codeResidue, false)
})

Deno.test('sanitizeArticle removes player error boilerplate', () => {
  const r = sanitizeArticle({
    title: 'x',
    content: 'To view this video please enable JavaScript, and consider upgrading to a web ' +
      'browser that supports HTML5 video Up Next Previous Page Next Page ' +
      'Thousands of activists have marched through London.',
  })
  assertEquals(r.content, 'Thousands of activists have marched through London.')
})
