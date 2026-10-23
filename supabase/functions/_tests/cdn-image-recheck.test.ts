import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { cdnImageProof } from '../../../scripts/data-quality/collect-cdn-image-rechecks.ts'

const url = 'https://img.queer.guide/event-images/' + 'a'.repeat(64) + '.png'
const png = new Uint8Array(65536)
png.set([137, 80, 78, 71, 13, 10, 26, 10])
const view = new DataView(png.buffer)
view.setUint32(16, 800); view.setUint32(20, 450)

async function withSource(mode: 'valid' | 'head-failed' | 'hash-html' | 'hash-truncated', run: () => Promise<void>) {
  const previous = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = { 'content-type': 'image/png', 'content-length': String(png.length) }
    if (init?.method === 'HEAD') return new Response(null, { status: mode === 'head-failed' ? 405 : 200, headers })
    if (!new Headers(init?.headers).has('range') && mode === 'hash-html') return new Response('not an image', { headers: { 'content-type': 'text/html' } })
    const bytes = !new Headers(init?.headers).has('range') && mode === 'hash-truncated' ? png.slice(1) : png
    return new Response(bytes, { headers })
  }) as typeof fetch
  try { await run() } finally { globalThis.fetch = previous }
}

Deno.test('CDN proof requires passing native cover dimensions and a complete fresh body hash', () => withSource('valid', async () => {
  const proof = await cdnImageProof(url)
  assertEquals(proof?.probe_role, 'cover')
  assertEquals(proof?.http_status, 200)
  assertEquals(proof?.width, 800); assertEquals(proof?.height, 450)
  assertEquals(proof?.byte_size, png.length)
  assertEquals(proof?.content_hash.length, 64)
}))
Deno.test('failed HEAD does not manufacture positive evidence', () => withSource('head-failed', async () => {
  assertEquals(await cdnImageProof(url), null)
}))
Deno.test('a changed HTML response during hashing invalidates the proof', () => withSource('hash-html', async () => {
  assertEquals(await cdnImageProof(url), null)
}))
Deno.test('a truncated full-body response invalidates the proof', () => withSource('hash-truncated', async () => {
  assertEquals(await cdnImageProof(url), null)
}))
Deno.test('external or unregistered image URLs are rejected before fetching', async () => {
  await assertRejects(() => cdnImageProof('https://example.com/image.png'), Error, 'registered CDN')
  await assertRejects(() => cdnImageProof('https://img.queer.guide/private.png'), Error, 'registered CDN')
})
