import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { gateImages, isLogoUrl } from './image-gate.ts'

Deno.test('keeps a normal content photo', () => {
  const r = gateImages(['https://images.pexels.com/photos/123/bar.jpg'])
  assertEquals(r.kept, ['https://images.pexels.com/photos/123/bar.jpg'])
  assertEquals(r.dropped.length, 0)
})

Deno.test('drops logo.dev / clearbit logo CDNs', () => {
  const r = gateImages([
    'https://img.logo.dev/eagle-berlin.de?size=128',
    'https://logo.clearbit.com/example.com',
    'https://cdn.example.com/photo.jpg',
  ])
  assertEquals(r.kept, ['https://cdn.example.com/photo.jpg'])
  assertEquals(r.dropped.map((d) => d.reason).sort(), ['logo_host', 'logo_host'])
})

Deno.test('drops data URIs, SVGs, and token-matched junk', () => {
  const r = gateImages([
    'data:image/png;base64,AAAA',
    'https://cdn.example.com/icon.svg',
    'https://cdn.example.com/sprite-sheet.png',
    'https://cdn.example.com/tracking-pixel.gif',
    'https://cdn.example.com/real.jpg',
  ])
  assertEquals(r.kept, ['https://cdn.example.com/real.jpg'])
  assertEquals(r.dropped.length, 4)
})

Deno.test('de-duplicates and preserves order', () => {
  const r = gateImages([
    'https://cdn.example.com/a.jpg',
    'https://cdn.example.com/b.jpg',
    'https://cdn.example.com/a.jpg',
  ])
  assertEquals(r.kept, ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'])
  assertEquals(r.dropped[0].reason, 'duplicate')
})

Deno.test('tolerates non-array / empty input', () => {
  assertEquals(gateImages(null).kept, [])
  assertEquals(gateImages(undefined).kept, [])
  assertEquals(gateImages('not-an-array').kept, [])
})

Deno.test('isLogoUrl flags logo CDNs only', () => {
  assert(isLogoUrl('https://img.logo.dev/x.png'))
  assert(!isLogoUrl('https://images.pexels.com/x.jpg'))
  assert(!isLogoUrl('not a url'))
})
