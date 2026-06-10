// Run with: cd supabase/functions && deno test _shared/marketplace-normalize.test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  buildAttributeVocab,
  classifyDepartment,
  classifyMerchantType,
  contentTierRank,
  normalizeMarketplaceProduct,
  scoreRelevance,
  slugifySubcat,
} from './marketplace-normalize.ts'

const vocab = buildAttributeVocab([
  { slug: 'cotton', category: 'material' },
  { slug: 'leather', category: 'material' },
  { slug: 'vegan-leather', category: 'material' },
  { slug: 'silicone', category: 'material' },
  { slug: 'stainless-steel', category: 'material' },
  { slug: 'silver', category: 'material' },
  { slug: 'pride', category: 'occasion' },
  { slug: 'drag', category: 'occasion' },
  { slug: 'wedding', category: 'occasion' },
  { slug: 'gym', category: 'occasion' },
  { slug: 'minimal', category: 'vibe' },
  { slug: 'handmade', category: 'vibe' },
])

Deno.test('slugifySubcat normalizes spacing/case/punctuation', () => {
  assertEquals(slugifySubcat('Sex Toys'), 'sex_toys')
  assertEquals(slugifySubcat('Cock Rings and Stretchers'), 'cock_rings_and_stretchers')
  assertEquals(slugifySubcat('Apparel and Accessories'), 'apparel_and_accessories')
})

Deno.test('classifyDepartment: adult keywords win and are specific', () => {
  assertEquals(classifyDepartment({ title: 'Silicone Butt Plug Kit' }).slug, 'anal_toys')
  assertEquals(classifyDepartment({ title: 'Stainless Steel Cock Ring' }).slug, 'cock_rings_and_stretchers')
  assertEquals(classifyDepartment({ title: 'Leather Bondage Restraint Set' }).slug, 'bdsm_and_bondage')
  assertEquals(classifyDepartment({ title: 'Realistic Dildo 7 inch' }).slug, 'sex_toys')
  assertEquals(classifyDepartment({ title: 'Neoprene Pup Hood' }).slug, 'pup_and_pet_play')
  assertEquals(classifyDepartment({ title: 'Latex Fetish Suit' }).slug, 'fetish_wear')
  assertEquals(classifyDepartment({ title: 'Chastity Cage' }).slug, 'chastity')
})

Deno.test('classifyDepartment: SFW buckets + ring disambiguation', () => {
  assertEquals(classifyDepartment({ title: 'Cotton Pride T-Shirt' }).slug, 'apparel_and_accessories')
  assertEquals(classifyDepartment({ title: 'Mens Jockstrap Brief' }).slug, 'underwear_and_swimwear')
  assertEquals(classifyDepartment({ title: 'Swim Trunks Bikini' }).slug, 'swimwear')
  // "ring" alone (not cock ring) -> jewelry
  assertEquals(classifyDepartment({ title: 'Sterling Silver Pride Ring' }).slug, 'jewelry_and_pins')
  assertEquals(classifyDepartment({ title: 'Queer Poetry Book' }).slug, 'books_and_art')
  assertEquals(classifyDepartment({ title: 'Intimate Wash Lube' }).slug, 'hygiene_and_care')
})

Deno.test('classifyDepartment: no evidence keeps existing subcategory at low confidence', () => {
  const r = classifyDepartment({ title: 'Mystery Item', subcategory: 'Jewelry and Pins' })
  assertEquals(r.slug, 'jewelry_and_pins')
  assertEquals(r.confidence < 0.5, true)
})

Deno.test('attributes: only literal vocab terms, default-reject', () => {
  const r = normalizeMarketplaceProduct(
    { title: 'Handmade Sterling Silver Pride Ring', description: 'Minimal organic cotton pouch included. Random noise words.' },
    vocab,
  )
  assertEquals(r.attributes.material, ['cotton', 'silver'])
  assertEquals(r.attributes.occasion, ['pride'])
  assertEquals(r.attributes.vibe, ['handmade', 'minimal'])
})

Deno.test('attributes: alias collapses (faux leather -> vegan-leather, not leather)', () => {
  const r = normalizeMarketplaceProduct({ title: 'Faux Leather Harness' }, vocab)
  assertEquals(r.attributes.material, ['vegan-leather'])
})

Deno.test('scoreRelevance: ownership + queer markers raise score above flat baseline', () => {
  assertEquals(scoreRelevance({ title: 'Plain mug' }), 0.6)
  assertEquals(scoreRelevance({ title: 'Pride flag', communityOwnedTags: ['queer_owned'] }), 1)
  assertEquals(scoreRelevance({ title: 'Rainbow socks' }) > 0.6, true)
})

Deno.test('classifyMerchantType: German merchant labels map to canonical departments', () => {
  assertEquals(classifyMerchantType('Vibratoren')?.slug, 'sex_toys')
  assertEquals(classifyMerchantType('Gleitgel')?.slug, 'hygiene_and_care')
  assertEquals(classifyMerchantType('Analplugs')?.slug, 'anal_toys')
  assertEquals(classifyMerchantType('Kleid')?.slug, 'apparel_and_accessories')
  assertEquals(classifyMerchantType('Handschellen')?.slug, 'bdsm_and_bondage')
  assertEquals(classifyMerchantType('Penisring')?.slug, 'cock_rings_and_stretchers')
  assertEquals(classifyMerchantType('Peniskäfig')?.slug, 'chastity')
  assertEquals(classifyMerchantType('Jockstraps')?.slug, 'underwear_and_swimwear')
  assertEquals(classifyMerchantType('Halsketten')?.slug, 'jewelry_and_pins')
  assertEquals(classifyMerchantType('Catsuit')?.slug, 'fetish_wear')
  assertEquals(classifyMerchantType('Kondome')?.slug, 'hygiene_and_care')
  assertEquals(classifyMerchantType('Penispumpe')?.slug, 'pumps_and_enlargement')
  assertEquals(classifyMerchantType('Bademode')?.slug, 'swimwear')
  assertEquals(classifyMerchantType('Pin-up Kalender')?.slug, 'books_and_art')
})

Deno.test('classifyMerchantType: precedence resolves compound German labels', () => {
  assertEquals(classifyMerchantType('Analkugelkette')?.slug, 'anal_toys')      // not jewelry via Kette
  assertEquals(classifyMerchantType('Nippelklemmen')?.slug, 'bdsm_and_bondage') // not jewelry
  assertEquals(classifyMerchantType('Straps-Kleid')?.slug, 'underwear_and_swimwear') // lingerie, not apparel
  assertEquals(classifyMerchantType('Lack-Hose')?.slug, 'fetish_wear')          // wetlook, not apparel
  assertEquals(classifyMerchantType('Strumpfhose')?.slug, 'underwear_and_swimwear')
  assertEquals(classifyMerchantType('Halsband')?.slug, 'bdsm_and_bondage')      // collar, not necklace
})

Deno.test('classifyMerchantType: no signal -> null (falls through to text tier)', () => {
  assertEquals(classifyMerchantType('Sonderposten'), null)
  assertEquals(classifyMerchantType(''), null)
  assertEquals(classifyMerchantType(null), null)
})

Deno.test('attributes: German aliases map to canonical slugs', () => {
  const r = normalizeMarketplaceProduct(
    { title: 'Harness aus Leder', description: 'Handgefertigt, mit Edelstahl-Details für die Hochzeit.' },
    vocab,
  )
  assertEquals(r.attributes.material, ['leather', 'stainless-steel'])
  assertEquals(r.attributes.occasion, ['wedding'])
  assertEquals(r.attributes.vibe, ['handmade'])
})

Deno.test('contentTierRank mirrors SQL rating tiers', () => {
  assertEquals(contentTierRank('sex_toys', 'Dildo'), 4)
  assertEquals(contentTierRank('fetish_wear', 'Latex'), 3)
  assertEquals(contentTierRank('underwear_and_swimwear', 'Briefs'), 2)
  assertEquals(contentTierRank('apparel_and_accessories', 'Cotton tee'), 1)
  // keyword escalation overrides a SFW department slug
  assertEquals(contentTierRank('apparel_and_accessories', 'Strap-on harness dildo'), 4)
})
