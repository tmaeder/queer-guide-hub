import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { extractArticle } from './extract.ts'

const BASE = 'https://example.com/news/story'

Deno.test('extracts JSON-LD articleBody + metadata', () => {
  const body = 'Lawmakers in the region passed a sweeping equality bill on Tuesday. '.repeat(8)
  const html = `<!doctype html><html lang="en"><head>
    <meta property="og:image" content="/img/hero.jpg">
    <script type="application/ld+json">${JSON.stringify({
      '@type': 'NewsArticle',
      articleBody: body,
      author: { '@type': 'Person', name: 'Jane Doe' },
      datePublished: '2026-05-29T10:00:00Z',
    })}</script></head><body><article><p>nav junk</p></article></body></html>`
  const r = extractArticle(html, BASE)
  assertEquals(r.method, 'jsonld')
  assert(r.content.includes('equality bill'))
  assertEquals(r.author, 'Jane Doe')
  assertEquals(r.publishedAt, '2026-05-29T10:00:00.000Z')
  assertEquals(r.imageUrl, 'https://example.com/img/hero.jpg')
  assertEquals(r.lang, 'en')
})

Deno.test('falls back to <article> body and strips noise', () => {
  const para = '<p>' + 'Pride organisers confirmed the march will proceed as planned. '.repeat(6) + '</p>'
  const html = `<html><head></head><body>
    <nav><p>Home About Contact</p></nav>
    <article><h1>Headline</h1>${para}${para}
      <aside class="related"><p>read more elsewhere</p></aside></article>
    <footer><p>copyright</p></footer></body></html>`
  const r = extractArticle(html, BASE)
  assertEquals(r.method, 'article')
  assert(r.content.includes('Pride organisers'))
  assert(!r.content.includes('copyright'))
  assert(!r.content.includes('read more elsewhere'))
})

Deno.test('density fallback when no semantic container', () => {
  const p = '<p>' + 'A court ruling expanded protections for transgender workers nationwide. '.repeat(5) + '</p>'
  const html = `<html><body><div class="content">${p}${p}${p}</div></body></html>`
  const r = extractArticle(html, BASE)
  assert(['density', 'main', 'article'].includes(r.method))
  assert(r.content.includes('court ruling'))
})

Deno.test('returns empty result for junk/empty html', () => {
  assertEquals(extractArticle('', BASE).method, 'none')
  assertEquals(extractArticle('<html><body><p>hi</p></body></html>', BASE).content, '')
})

Deno.test('multiple JSON-LD blocks: picks the article node', () => {
  const body = 'The festival returns to the city this summer after a two-year pause. '.repeat(6)
  const html = `<html><head>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', name: 'Example' })}</script>
    <script type="application/ld+json">${JSON.stringify({ '@graph': [
      { '@type': 'WebPage' },
      { '@type': 'Article', articleBody: body, author: 'Sam Lee' },
    ] })}</script>
  </head><body></body></html>`
  const r = extractArticle(html, BASE)
  assertEquals(r.method, 'jsonld')
  assertEquals(r.author, 'Sam Lee')
  assert(r.content.includes('festival'))
})
