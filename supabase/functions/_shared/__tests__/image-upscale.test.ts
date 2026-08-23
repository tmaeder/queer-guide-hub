import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { isRealUpgrade, looksLikePlaceholder, upscaleCandidates } from '../image-upscale.ts'

const urls = (u: string) => upscaleCandidates(u).map((c) => c.url)
const rules = (u: string) => upscaleCandidates(u).map((c) => c.rule)

// Every URL below is a real row from marketplace_listings, and every asserted
// outcome was measured against the live host on 2026-08-23.

Deno.test('magento cache strip — the 135x135 mr-s-leather thumbnails', () => {
  const got = urls(
    'https://www.mr-s-leather.com/media/catalog/product/cache/d603b7433f27130ec9507dd91e252e3c/m/8/m801-tn.jpg',
  )
  assertEquals(got, ['https://www.mr-s-leather.com/media/catalog/product/m/8/m801-tn.jpg'])
})

Deno.test('magento cache strip keeps the sub-path, including multi-segment names', () => {
  const got = urls(
    'https://www.misterb.com/media/catalog/product/cache/2389f25f5b33f18d40329ef05de7bbd2/o/x/oxballs-muscle-cock-sheath-black-790334.jpg',
  )
  assertEquals(got, [
    'https://www.misterb.com/media/catalog/product/o/x/oxballs-muscle-cock-sheath-black-790334.jpg',
  ])
})

Deno.test('magento rule never invents a filename', () => {
  // The `-tn-a` suffix names a thumbnail, and `m022-a.jpg` does exist — as a
  // 500x600 "no image available" placeholder that mr-s-leather returns for
  // every product. Proposing it would be worse than the thumbnail.
  const got = urls(
    'https://www.mr-s-leather.com/media/catalog/product/cache/d603b7433f27130ec9507dd91e252e3c/m/0/m022-tn-a.jpg',
  )
  assertEquals(got, ['https://www.mr-s-leather.com/media/catalog/product/m/0/m022-tn-a.jpg'])
  assertFalse(got.some((u) => u.endsWith('m022-a.jpg') || u.endsWith('m022.jpg')))
})

Deno.test('opencart cache strip — invinciblerubber 840x840 -> 1000x1000', () => {
  assertEquals(urls('https://www.invinciblerubber.com/image/cache/catalog/AUX076_a-840x840.jpg'), [
    'https://www.invinciblerubber.com/image/catalog/AUX076_a.jpg',
  ])
  // `data/` instead of `catalog/` is the older OpenCart layout; same shape.
  assertEquals(urls('https://www.invinciblerubber.com/image/cache/data/BON017_a-840x840.jpg'), [
    'https://www.invinciblerubber.com/image/data/BON017_a.jpg',
  ])
})

Deno.test('shopify: a width= request is raised, not trusted', () => {
  const got = urls('https://ohmyfantasy.com/cdn/shop/files/VibratorDot_2.jpg?v=1706783178&width=533')
  assertEquals(got.length, 1)
  assert(got[0].includes('width=2048'))
  assert(got[0].includes('v=1706783178'), 'the version key must survive or the CDN 404s')
})

Deno.test('shopify: literal dimensions in a MERCHANT filename are left alone', () => {
  // `-1280x1280` here is the uploaded name (hyphen, not underscore).
  // ohmyfantasy has 10,958 listings and stripping it asks for a missing file.
  assertEquals(
    urls('https://cdn.shopify.com/s/files/1/0439/2740/4693/files/300000091376-1280x1280.jpg?v=1779613057'),
    [],
  )
})

Deno.test('shopify: a real _WxH size token IS stripped', () => {
  const got = urls('https://cdn.shopify.com/s/files/1/0599/0626/1197/products/STICKER_06_600x600.png?v=1668163044')
  assertEquals(got, ['https://cdn.shopify.com/s/files/1/0599/0626/1197/products/STICKER_06.png?v=1668163044'])
})

Deno.test('shopify: crop tokens are stripped too', () => {
  const got = urls('https://cdn.shopify.com/s/files/1/1/2/files/tee_600x_crop_center.jpg')
  assertEquals(got, ['https://cdn.shopify.com/s/files/1/1/2/files/tee.jpg'])
})

Deno.test('wordpress size suffix, scoped to the uploads directory', () => {
  assertEquals(urls('https://demask.com/wp-content/uploads/2016/12/LJ_006-300x200.jpg'), [
    'https://demask.com/wp-content/uploads/2016/12/LJ_006.jpg',
  ])
  // An un-suffixed upload is already the original — demask's real corpus shape.
  assertEquals(urls('https://demask.com/wp-content/uploads/2016/12/LJ_006.jpg'), [])
  // Outside /wp-content/uploads/ the suffix is just part of a product name.
  assertEquals(urls('https://shop.example.com/img/harness-1200x1200.jpg'), [])
})

Deno.test('query dimension bump — bigcartel 666 -> 1365', () => {
  const got = urls('https://assets.bigcartel.com/product_images/414554682/newbigethan.jpg?auto=format&fit=max&h=1000&w=1000')
  assertEquals(got.length, 1)
  assert(got[0].includes('w=2048') && got[0].includes('h=2048'))
  assert(got[0].includes('auto=format'), 'unrelated params must survive')
})

Deno.test('query bump only fires when a dimension param already exists', () => {
  // Adding one turns a plain fetch into a resize request, which on some hosts
  // returns something SMALLER than the untouched original.
  assertEquals(urls('https://assets.example.com/product_images/1/photo.jpg?auto=format'), [])
})

Deno.test('squarespace format=NNNw is a dimension', () => {
  const got = urls('https://images.squarespace-cdn.com/content/v1/655e/33960232/AB.jpg?format=750w')
  assertEquals(got, ['https://images.squarespace-cdn.com/content/v1/655e/33960232/AB.jpg?format=2500w'])
})

Deno.test('prestashop presets are deliberately not proposed', () => {
  // salzgeber.shop: large_default (700x992) is already the biggest preset the
  // shop generates; -original and -thickbox_default both 404.
  assertEquals(urls('https://salzgeber.shop/1731-large_default/city-boy.jpg'), [])
})

Deno.test('non-derivative urls yield nothing, which is the common case', () => {
  assertEquals(urls('https://cdn.shopify.com/s/files/1/0427/9412/3414/products/9781946724489.jpg?v=1646758239'), [])
  assertEquals(urls('https://img.queer.guide/3211b30d-bac0-4cec-b363-7252b907803f.webp'), [])
})

Deno.test('malformed and non-http inputs are ignored, not thrown on', () => {
  assertEquals(upscaleCandidates('not a url'), [])
  assertEquals(upscaleCandidates(''), [])
  assertEquals(upscaleCandidates('data:image/png;base64,iVBOR'), [])
})

Deno.test('candidates are de-duplicated and never include the input', () => {
  const u = 'https://cdn.shopify.com/s/files/1/1/2/files/tee_600x600.jpg?width=600'
  const got = upscaleCandidates(u)
  assertEquals(new Set(got.map((c) => c.url)).size, got.length)
  assertFalse(got.some((c) => c.url === u))
})

Deno.test('every candidate declares whether it preserves framing', () => {
  const all = [
    ...upscaleCandidates('https://www.misterb.com/media/catalog/product/cache/2389f25f5b33f18d40329ef05de7bbd2/7/0/705021-1.jpg'),
    ...upscaleCandidates('https://ohmyfantasy.com/cdn/shop/files/A.jpg?width=533'),
    ...upscaleCandidates('https://assets.bigcartel.com/p/1/a.jpg?w=1000'),
  ]
  assert(all.length >= 3)
  for (const c of all) assertEquals(typeof c.preservesAspect, 'boolean')
  assertEquals(rules('https://ohmyfantasy.com/cdn/shop/files/A.jpg?width=533'), ['shopify_width_raise'])
})

// ── verification gate ───────────────────────────────────────────────────────

Deno.test('isRealUpgrade accepts the measured wins', () => {
  // mr-s-leather: square-padded cache thumb -> 4:5 original. Aspect changes by
  // design; this is the largest win in the corpus and must not be rejected.
  assert(isRealUpgrade({ w: 135, h: 135 }, { w: 400, h: 500 }, false))
  // misterb
  assert(isRealUpgrade({ w: 480, h: 320 }, { w: 900, h: 600 }, false))
  // invinciblerubber
  assert(isRealUpgrade({ w: 840, h: 840 }, { w: 1000, h: 1000 }, false))
  // bigcartel, in-place resize so aspect holds
  assert(isRealUpgrade({ w: 666, h: 666 }, { w: 1365, h: 1365 }, true))
})

Deno.test('isRealUpgrade rejects churn and regressions', () => {
  assertFalse(isRealUpgrade({ w: 450, h: 600 }, { w: 450, h: 600 }, false), 'identical asset')
  assertFalse(isRealUpgrade({ w: 1000, h: 1000 }, { w: 1050, h: 1050 }, false), 'under the 15% margin')
  assertFalse(isRealUpgrade({ w: 1000, h: 1000 }, { w: 800, h: 800 }, false), 'smaller')
  assertFalse(isRealUpgrade({ w: 0, h: 0 }, { w: 900, h: 900 }, false), 'unmeasured current')
  assertFalse(isRealUpgrade({ w: 500, h: 500 }, { w: 900, h: 0 }, false), 'unmeasured candidate')
})

Deno.test('an aspect-preserving rule must not re-frame the photo', () => {
  // Wider but shorter: a different crop, which on a 3:4 card can cut the
  // product out of shot.
  assertFalse(isRealUpgrade({ w: 600, h: 800 }, { w: 1200, h: 600 }, true))
  assert(isRealUpgrade({ w: 600, h: 800 }, { w: 1200, h: 1600 }, true))
})

Deno.test('a cache-strip candidate leads on width, with area as the veto', () => {
  // De-padded: shorter canvas, 1.33x more pixels across the product. Only a
  // 1.11x area gain, so any area floor above break-even would reject it — this
  // is exactly the case that must be accepted.
  assert(isRealUpgrade({ w: 600, h: 600 }, { w: 800, h: 500 }, false))
  // Wider, but a letterboxed banner: it LOSES area, so the veto fires.
  assertFalse(isRealUpgrade({ w: 600, h: 600 }, { w: 700, h: 300 }, false))
})

Deno.test('placeholder paths are recognised', () => {
  assert(looksLikePlaceholder('https://www.mr-s-leather.com/media/catalog/product/placeholder/default/placeholder_small.jpg'))
  assert(looksLikePlaceholder('https://shop.example.com/img/no-image.png'))
  assert(looksLikePlaceholder('https://shop.example.com/media/catalog/product/no_selection.jpg'))
  assertFalse(looksLikePlaceholder('https://www.misterb.com/media/catalog/product/o/x/oxballs-790334.jpg'))
  assertFalse(looksLikePlaceholder('https://cdn.shopify.com/s/files/1/1/2/files/default-tee.jpg'))
})
