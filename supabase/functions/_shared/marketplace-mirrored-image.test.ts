import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { mirroredImageMetadata, sourceImageMayBeMirrored } from './marketplace-mirrored-image.ts'

const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0))
const gif = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0))

Deno.test('mirrored PNG metadata describes actual bytes and exact served URL', () => {
  assertEquals(mirroredImageMetadata(png, 'https://img.queer.guide/marketplace-images/native.png'), {
    width: 1, height: 1, format: 'png', bytes: png.length,
    optimized_url: 'https://img.queer.guide/marketplace-images/native.png', optimization_status: 'cdn_optimized',
  })
})

Deno.test('GIF dimensions are measured without resizing or changing input bytes', () => {
  const before = gif.slice()
  assertEquals(mirroredImageMetadata(gif, 'https://img.queer.guide/marketplace-images/native.gif')?.width, 1)
  assertEquals(gif, before)
})

Deno.test('unknown and truncated files do not acquire invented dimensions', () => {
  assertEquals(mirroredImageMetadata(new Uint8Array(), 'native.jpg'), null)
  assertEquals(mirroredImageMetadata(new TextEncoder().encode('<html>denied</html>'), 'native.jpg'), null)
  assertEquals(mirroredImageMetadata(png.slice(0, 20), 'native.png'), null)
})

Deno.test('zero dimensions remain unqualified rather than becoming a successful measurement', () => {
  const emptyDimensions = png.slice()
  emptyDimensions.fill(0, 16, 24)
  assertEquals(mirroredImageMetadata(emptyDimensions, 'native.png'), null)
})


const healthy = { status: 'active', is_flagged: false, access_level: 'public', health_consecutive_failures: null, brand_category: 'photography' }
Deno.test('a fresh mirrored URL cannot bypass source moderation, access, health or artwork restrictions', () => {
  assertEquals(sourceImageMayBeMirrored(healthy), true)
  assertEquals(sourceImageMayBeMirrored({ ...healthy, is_flagged: true }), false)
  assertEquals(sourceImageMayBeMirrored({ ...healthy, status: 'superseded' }), false)
  assertEquals(sourceImageMayBeMirrored({ ...healthy, access_level: 'private' }), false)
  assertEquals(sourceImageMayBeMirrored({ ...healthy, health_consecutive_failures: 2 }), false)
  assertEquals(sourceImageMayBeMirrored({ ...healthy, brand_category: 'logo' }), false)
  assertEquals(sourceImageMayBeMirrored({ ...healthy, health_consecutive_failures: 1 }), true)
})
