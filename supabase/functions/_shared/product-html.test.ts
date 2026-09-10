import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { stripProductHtml, pickProductDescription } from './product-html.ts'

// Fixtures are REAL shapes lifted from the dancesafe.org WooCommerce Store API
// import (WPBakery/Porto page builder) — not hand-idealized ones.

// ---------------------------------------------------------------------------
// Defect 2 — <style>/<script> CONTENTS leaked into the description
// ---------------------------------------------------------------------------

Deno.test('stripProductHtml drops a <style> element WITH its stylesheet', () => {
  const html =
    '<style>.vc_custom_1718656914020{background-color: var(--porto-light-color) !important;}</style>' +
    '<div class="vc_row"><p><strong>IMPORTANT</strong> We have updated our shipping.</p></div>'
  const out = stripProductHtml(html)
  assert(!out.includes('background-color'), out)
  assert(!out.includes('vc_custom_1718656914020'), out)
  assertEquals(out, 'IMPORTANT We have updated our shipping.')
})

Deno.test('stripProductHtml drops a <script> element WITH its code', () => {
  const out = stripProductHtml('<p>Ships free.</p><script>window.dataLayer.push({a:1});</script>')
  assert(!out.includes('dataLayer'), out)
  assertEquals(out, 'Ships free.')
})

// ---------------------------------------------------------------------------
// Defect 3 — every tag became a space, which split words
// ---------------------------------------------------------------------------

Deno.test('stripProductHtml removes inline tags with NO separator', () => {
  const out = stripProductHtml('<strong>u</strong><strong>pdated February 2023.</strong>')
  assertEquals(out, 'updated February 2023.')
})

Deno.test('stripProductHtml keeps a separator between block tags', () => {
  assertEquals(stripProductHtml('<p>First para.</p><p>Second para.</p>'), 'First para. Second para.')
  assertEquals(stripProductHtml('<li>One</li><li>Two</li>'), 'One Two')
})

// ---------------------------------------------------------------------------
// WordPress shortcodes survive tag stripping as literal text
// ---------------------------------------------------------------------------

Deno.test('stripProductHtml removes WordPress shortcodes', () => {
  const out = stripProductHtml(
    '[vc_row][vc_column_text css=".vc_custom_1 {margin: 0;}"]<p>10 test strips.</p>[/vc_column_text][/vc_row]',
  )
  assertEquals(out, '10 test strips.')
})

Deno.test('stripProductHtml removes non-vc shortcodes too', () => {
  const out = stripProductHtml('[mk_divider style="thin_solid" /]<p>Body.</p>[et_pb_section fb_built="1"]')
  assertEquals(out, 'Body.')
})

Deno.test('stripProductHtml keeps prose in square brackets', () => {
  assertEquals(
    stripProductHtml('<p>Fentanyl [see note] is detected.</p>'),
    'Fentanyl [see note] is detected.',
  )
  assertEquals(stripProductHtml('<p>Contains 10 mg [0.01 g] per scoop.</p>'), 'Contains 10 mg [0.01 g] per scoop.')
})

// ---------------------------------------------------------------------------
// The raw JSON is double-encoded — entities must resolve to their character
// ---------------------------------------------------------------------------

Deno.test('stripProductHtml decodes double-encoded entities', () => {
  assertEquals(stripProductHtml('<p>We&amp;#8217;ve updated it.</p>'), 'We’ve updated it.')
  assertEquals(stripProductHtml('<p>He said &#8220;hi&#8221;.</p>'), 'He said “hi”.')
})

Deno.test('stripProductHtml decodes entity-encoded markup', () => {
  assertEquals(stripProductHtml('&lt;p&gt;Encoded para.&lt;/p&gt;'), 'Encoded para.')
})

Deno.test('stripProductHtml keeps a decoded comparison operator', () => {
  // `&lt;` decodes to a bare `<`, which the tag state machine would otherwise read
  // as an unterminated tag and swallow the rest of the sentence.
  assertEquals(stripProductHtml('<p>Results in &lt; 5 minutes, 10 mg per scoop.</p>'), 'Results in < 5 minutes, 10 mg per scoop.')
})

Deno.test('stripProductHtml is safe on empty / nullish input', () => {
  assertEquals(stripProductHtml(''), '')
  assertEquals(stripProductHtml(null), '')
  assertEquals(stripProductHtml(undefined), '')
})

// ---------------------------------------------------------------------------
// Defect 1 — `a || b` discarded short_description whenever `a` was truthy
// ---------------------------------------------------------------------------

Deno.test('pickProductDescription prefers short_description when description strips to empty', () => {
  // Real shape: a page-builder description that is pure layout markup — truthy,
  // but nothing survives stripping.
  const description =
    '<div class="vc_row wpb_row"><div class="wpb_column"><div class="vc_column-inner"><div class="wpb_wrapper">' +
    '<style>.vc_custom_1{padding: 0;}</style>[vc_row][/vc_row]</div></div></div></div>'
  const short = '<p>Our fentanyl test strips detect fentanyl in a substance sample.</p>'
  assertEquals(
    pickProductDescription(description, short),
    'Our fentanyl test strips detect fentanyl in a substance sample.',
  )
})

Deno.test('pickProductDescription returns the longer stripped text', () => {
  const description = '<p>A much longer and more complete product description here.</p>'
  const short = '<p>Short blurb.</p>'
  assertEquals(
    pickProductDescription(description, short),
    'A much longer and more complete product description here.',
  )
  assertEquals(
    pickProductDescription(short, description),
    'A much longer and more complete product description here.',
  )
})

Deno.test('pickProductDescription returns empty when both strip to nothing', () => {
  assertEquals(pickProductDescription('<div class="vc_row"></div>', ''), '')
  assertEquals(pickProductDescription(null, undefined), '')
})
