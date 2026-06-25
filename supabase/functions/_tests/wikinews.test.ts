import { assertEquals, assert } from 'jsr:@std/assert'
import {
  isWikinewsHost,
  parseWikinewsCategoryUrl,
  stripArticleTail,
  firstParagraph,
  parseDateline,
  mapWikinewsPage,
} from '../_shared/wikinews.ts'

Deno.test('isWikinewsHost matches only wikinews.org hosts', () => {
  assert(isWikinewsHost('https://en.wikinews.org/wiki/Category:LGBT'))
  assert(isWikinewsHost('https://es.wikinews.org/wiki/Categoría:LGBT'))
  assert(!isWikinewsHost('https://en.wikipedia.org/wiki/LGBT'))
  assert(!isWikinewsHost('https://www.advocate.com/feeds/feed.rss'))
  assert(!isWikinewsHost('not a url'))
  // lookalike hosts that merely END WITH wikinews.org must NOT match
  assert(!isWikinewsHost('https://evilwikinews.org/wiki/Category:LGBT'))
  assert(!isWikinewsHost('https://wikinews.org.attacker.com/wiki/Category:LGBT'))
})

Deno.test('parseWikinewsCategoryUrl: plain /wiki/Category:LGBT', () => {
  const t = parseWikinewsCategoryUrl('https://en.wikinews.org/wiki/Category:LGBT')
  assertEquals(t.apiBase, 'https://en.wikinews.org/w/api.php')
  assertEquals(t.category, 'Category:LGBT')
})

Deno.test('parseWikinewsCategoryUrl: percent-encoded colon', () => {
  const t = parseWikinewsCategoryUrl('https://en.wikinews.org/wiki/Category%3ALGBT')
  assertEquals(t.category, 'Category:LGBT')
})

Deno.test('parseWikinewsCategoryUrl: ?title= form and bare category get prefixed', () => {
  assertEquals(
    parseWikinewsCategoryUrl('https://en.wikinews.org/w/index.php?title=Category:LGBT').category,
    'Category:LGBT',
  )
  assertEquals(
    parseWikinewsCategoryUrl('https://en.wikinews.org/wiki/LGBT').category,
    'Category:LGBT',
  )
})

Deno.test('parseWikinewsCategoryUrl rejects non-wikinews hosts', () => {
  let threw = false
  try {
    parseWikinewsCategoryUrl('https://en.wikipedia.org/wiki/Category:LGBT')
  } catch {
    threw = true
  }
  assert(threw)
})

Deno.test('stripArticleTail cuts boilerplate sections', () => {
  const body = 'The ACT legalised same-sex marriage yesterday.\n\nMore detail here.\n\nSources\n\nABC News, "..."'
  assertEquals(stripArticleTail(body), 'The ACT legalised same-sex marriage yesterday.\n\nMore detail here.')
})

Deno.test('stripArticleTail leaves bodies without a tail intact', () => {
  const body = 'A short brief with no trailing sections.'
  assertEquals(stripArticleTail(body), body)
})

Deno.test('firstParagraph drops the Wikinews dateline and collapses whitespace', () => {
  const text = 'Tuesday, January 28, 2025\n \n\nThe Australian Capital Territory\nlegalised same-sex marriage.\n\nSecond paragraph.'
  assertEquals(firstParagraph(text), 'The Australian Capital Territory legalised same-sex marriage.')
})

Deno.test('parseDateline reads the editorial publication date', () => {
  assertEquals(parseDateline('Tuesday, January 28, 2025\n\nBody'), '2025-01-28T00:00:00.000Z')
  assertEquals(parseDateline('Wednesday, October 23, 2013'), '2013-10-23T00:00:00.000Z')
  assertEquals(parseDateline('No dateline here'), null)
  assertEquals(parseDateline(''), null)
})

Deno.test('mapWikinewsPage maps a full page to the record shape', () => {
  const rec = mapWikinewsPage({
    pageid: 873064,
    title: 'Australian Capital Territory legalises same-sex marriage',
    extract: 'Wednesday, October 23, 2013\n\nThe ACT legalised same-sex marriage.\n\nSources\n\nABC',
    canonicalurl: 'https://en.wikinews.org/wiki/Australian_Capital_Territory_legalises_same-sex_marriage',
    // pageimages appends utm tracking params — these must be stripped.
    original: { source: 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Rainbow_flag.jpg?utm_source=en.wikinews.org&utm_campaign=api' },
  })
  assert(rec)
  assertEquals(rec!.title, 'Australian Capital Territory legalises same-sex marriage')
  assertEquals(rec!.published_at, '2013-10-23T00:00:00.000Z') // from the dateline
  assertEquals(rec!.excerpt, 'The ACT legalised same-sex marriage.')
  assertEquals(rec!.author, 'Wikinews')
  assertEquals(rec!.publisher_name, 'Wikinews')
  assertEquals(rec!.image_url, 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Rainbow_flag.jpg')
  assertEquals(rec!.image_attribution, 'Wikimedia Commons')
  assert(!String(rec!.content).includes('Sources'))
})

Deno.test('mapWikinewsPage returns a record with null date when there is no dateline', () => {
  const rec = mapWikinewsPage({
    pageid: 1,
    title: 'Extract-less article',
    canonicalurl: 'https://en.wikinews.org/wiki/X',
  })
  assert(rec)
  assertEquals(rec!.published_at, null) // caller fills from first revision
})

Deno.test('mapWikinewsPage returns null for missing/untitled pages', () => {
  assertEquals(mapWikinewsPage({ title: 'X', missing: true }), null)
  assertEquals(mapWikinewsPage({ extract: 'body' }), null)
  assertEquals(mapWikinewsPage(null), null)
})

Deno.test('mapWikinewsPage omits image attribution when there is no image', () => {
  const rec = mapWikinewsPage({
    title: 'Some brief',
    extract: 'Monday, January 1, 2024\n\nA brief with no image.',
    canonicalurl: 'https://en.wikinews.org/wiki/Some_brief',
  })
  assert(rec)
  assertEquals(rec!.image_url, null)
  assertEquals(rec!.image_attribution, null)
})
