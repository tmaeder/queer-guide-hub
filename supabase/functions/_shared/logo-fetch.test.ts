import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { fetchLogoForMirror, sniffImageType, MAX_LOGO_BYTES } from './logo-fetch.ts'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(100).fill(0)])
const SVG = new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg">' + ' '.repeat(80) + '</svg>')
const HTML = new TextEncoder().encode('<!doctype html><html><body>Not found</body></html>' + ' '.repeat(80))

const fakeFetch = (body: Uint8Array | null, status = 200, headers: Record<string, string> = {}) =>
  (async () => new Response(body as BodyInit | null, { status, headers })) as unknown as typeof fetch

Deno.test('sniffs PNG and SVG, rejects HTML', () => {
  assertEquals(sniffImageType(PNG), 'image/png')
  assertEquals(sniffImageType(SVG), 'image/svg+xml')
  assertEquals(sniffImageType(HTML), null)
})

Deno.test('content type comes from the bytes, not the header', async () => {
  const r = await fetchLogoForMirror('https://cdn.example/a', fakeFetch(PNG, 200, { 'content-type': 'application/octet-stream' }))
  assertEquals(r.ok && r.contentType, 'image/png')
})

Deno.test('a 200 HTML page is a permanent not_image', async () => {
  const r = await fetchLogoForMirror('https://cdn.example/a', fakeFetch(HTML, 200, { 'content-type': 'image/png' }))
  assertEquals(r, { ok: false, reason: 'not_image', permanent: true })
})

Deno.test('404 is permanent, 429 and 503 are transient', async () => {
  assertEquals(await fetchLogoForMirror('https://x/a', fakeFetch(null, 404)), { ok: false, reason: 'http_404', permanent: true })
  assertEquals(await fetchLogoForMirror('https://x/a', fakeFetch(null, 429)), { ok: false, reason: 'http_429', permanent: false })
  assertEquals(await fetchLogoForMirror('https://x/a', fakeFetch(null, 503)), { ok: false, reason: 'http_503', permanent: false })
})

Deno.test('network errors are transient; non-http URLs permanent', async () => {
  const boom = (async () => { throw new TypeError('dns') }) as unknown as typeof fetch
  assertEquals(await fetchLogoForMirror('https://x/a', boom), { ok: false, reason: 'network', permanent: false })
  assertEquals(await fetchLogoForMirror('data:image/png;base64,AAAA', boom), { ok: false, reason: 'invalid_url', permanent: true })
})

Deno.test('oversized bodies are refused', async () => {
  const big = new Uint8Array(MAX_LOGO_BYTES + 1)
  big.set(PNG)
  assertEquals(await fetchLogoForMirror('https://x/a', fakeFetch(big)), { ok: false, reason: 'too_large', permanent: true })
})

Deno.test('SVG is refused, not mirrored', async () => {
  assertEquals(await fetchLogoForMirror('https://x/a.svg', fakeFetch(SVG, 200, { 'content-type': 'image/svg+xml' })), {
    ok: false,
    reason: 'svg_refused',
    permanent: true,
  })
})

Deno.test('GIF is accepted', () => {
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...new Array(100).fill(0)])
  assertEquals(sniffImageType(gif), 'image/gif')
})
