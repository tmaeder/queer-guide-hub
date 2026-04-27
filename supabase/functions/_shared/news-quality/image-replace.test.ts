import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { _internals } from './image-replace.ts'

const { pickMeta } = _internals

const SAMPLE_HTML = `<!doctype html><html><head>
  <meta property="og:title" content="A Pride story" />
  <meta property="og:image" content="https://cdn.example.com/og.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://cdn.example.com/tw.jpg" />
</head><body>...</body></html>`

Deno.test('pickMeta returns og:image when present', () => {
  const v = pickMeta(SAMPLE_HTML, ['og:image'])
  assertEquals(v, 'https://cdn.example.com/og.jpg')
})

Deno.test('pickMeta returns twitter:image fallback', () => {
  const html = SAMPLE_HTML.replace(/<meta property="og:image"[^>]+>/, '')
  const v = pickMeta(html, ['og:image']) // not present
  assertEquals(v, null)
  const t = pickMeta(html, ['twitter:image'])
  assertEquals(t, 'https://cdn.example.com/tw.jpg')
})

Deno.test('pickMeta ignores relative URLs', () => {
  const html = `<meta property="og:image" content="/relative.jpg" />`
  assertEquals(pickMeta(html, ['og:image']), null)
})

Deno.test('pickMeta is robust to attribute order', () => {
  const html = `<meta content="https://x.com/y.jpg" property="og:image" />`
  assertEquals(pickMeta(html, ['og:image']), 'https://x.com/y.jpg')
})

Deno.test('pickMeta returns null when no matching meta tags', () => {
  const html = `<!doctype html><html><head><title>x</title></head></html>`
  assertEquals(pickMeta(html, ['og:image']), null)
})

Deno.test('pickMeta walks past unrelated meta tags', () => {
  const html = `
    <meta charset="utf-8" />
    <meta name="description" content="not an image url" />
    <meta property="og:image" content="https://x.com/y.jpg" />
  `
  assertEquals(pickMeta(html, ['og:image']), 'https://x.com/y.jpg')
})
