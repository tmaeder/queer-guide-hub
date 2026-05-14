import { assertEquals, assert, assertNotEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { canonicaliseImageUrl, hashImageUrl } from './image-hash.ts'

Deno.test('canonicaliseImageUrl strips utm_* + tracking params', () => {
  const out = canonicaliseImageUrl(
    'https://CDN.example.com/img.jpg?utm_source=feed&utm_campaign=lgbt&width=1200',
  )
  assertEquals(out, 'https://cdn.example.com/img.jpg')
})

Deno.test('canonicaliseImageUrl preserves CDN-relevant params + sorts', () => {
  const out = canonicaliseImageUrl('https://x.com/y.jpg?b=2&a=1&utm_source=foo')
  assertEquals(out, 'https://x.com/y.jpg?a=1&b=2')
})

Deno.test('canonicaliseImageUrl drops default ports + fragments', () => {
  assertEquals(
    canonicaliseImageUrl('http://example.com:80/img.png#frag'),
    'http://example.com/img.png',
  )
  assertEquals(
    canonicaliseImageUrl('https://example.com:443/img.png'),
    'https://example.com/img.png',
  )
})

Deno.test('canonicaliseImageUrl rejects relative + non-http schemes', () => {
  assertEquals(canonicaliseImageUrl('/relative.jpg'), null)
  assertEquals(canonicaliseImageUrl('ftp://example.com/x.jpg'), null)
  assertEquals(canonicaliseImageUrl(''), null)
})

Deno.test('canonicaliseImageUrl is idempotent', () => {
  const a = canonicaliseImageUrl('https://x.com/y.jpg?utm_source=foo&z=keep')
  const b = canonicaliseImageUrl(a!)
  assertEquals(a, b)
})

Deno.test('hashImageUrl: same canonical URL → same hash', async () => {
  const a = await hashImageUrl('https://x.com/y.jpg?utm_source=feed-a')
  const b = await hashImageUrl('https://x.com/y.jpg?utm_source=feed-b')
  assertEquals(a, b)
  assert(a && a.length === 64) // SHA-256 hex
})

Deno.test('hashImageUrl: different canonical URLs → different hashes', async () => {
  const a = await hashImageUrl('https://x.com/y.jpg')
  const b = await hashImageUrl('https://x.com/z.jpg')
  assertNotEquals(a, b)
})

Deno.test('hashImageUrl: returns null for invalid URLs', async () => {
  assertEquals(await hashImageUrl(''), null)
  assertEquals(await hashImageUrl('not-a-url'), null)
})
