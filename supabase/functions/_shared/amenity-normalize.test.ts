import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildVocab, classifyTerm, normalizeVenueAmenities, slugify } from './amenity-normalize.ts'

const vocab = buildVocab([
  { slug: 'wifi', kind: 'amenity', category_scope: ['all'] },
  { slug: 'parking', kind: 'amenity', category_scope: ['all'] },
  { slug: 'full-bar', kind: 'amenity', category_scope: ['bar'] },
  { slug: 'beer', kind: 'amenity', category_scope: ['bar'] },
  { slug: 'outdoor-seating', kind: 'amenity', category_scope: ['bar'] },
  { slug: 'happy-hour', kind: 'amenity', category_scope: ['bar'] },
  { slug: 'gym', kind: 'amenity', category_scope: ['gym'] },
  { slug: 'darkroom', kind: 'amenity', category_scope: ['sauna'] },
  { slug: 'wheelchair-accessible', kind: 'accessibility', category_scope: ['all'] },
  { slug: 'gender-neutral-restroom', kind: 'accessibility', category_scope: ['all'] },
  { slug: 'step-free-entrance', kind: 'accessibility', category_scope: ['all'] },
  { slug: 'clothing-optional', kind: 'queer', category_scope: ['sauna'] },
  { slug: 'lgbtq-owned', kind: 'queer', category_scope: ['all'] },
  { slug: 'queer-friendly', kind: 'queer', category_scope: ['all'] },
])

Deno.test('slugify normalizes punctuation/case', () => {
  assertEquals(slugify('Wi-Fi'), 'wi-fi')
  assertEquals(slugify('  Outdoor Seating! '), 'outdoor-seating')
})

Deno.test('classifyTerm: aliases map to canonical amenity slug', () => {
  assertEquals(classifyTerm('free wifi', vocab), { kind: 'amenity', slug: 'wifi' })
  assertEquals(classifyTerm('wi-fi', vocab), { kind: 'amenity', slug: 'wifi' })
  assertEquals(classifyTerm('gym-nearby', vocab), { kind: 'amenity', slug: 'gym' })
  assertEquals(classifyTerm('liquor', vocab), { kind: 'amenity', slug: 'full-bar' })
})

Deno.test('classifyTerm: accessibility split out', () => {
  assertEquals(classifyTerm('accessible', vocab), { kind: 'accessibility', slug: 'wheelchair-accessible' })
  assertEquals(classifyTerm('gender neutral restroom', vocab), { kind: 'accessibility', slug: 'gender-neutral-restroom' })
  assertEquals(classifyTerm('elevator', vocab), { kind: 'accessibility', slug: 'step-free-entrance' })
})

Deno.test('classifyTerm: queer markers', () => {
  assertEquals(classifyTerm('clothing-optional-accepted', vocab), { kind: 'queer', slug: 'clothing-optional' })
  assertEquals(classifyTerm('lgbtq owned', vocab), { kind: 'queer', slug: 'lgbtq-owned' })
  // bare-handle forms map to queer-friendly (kept in sync with normalize_venue_tags SQL vocab)
  for (const h of ['lgbtq', 'lgbt', 'lgbtqia', 'queer', 'gay']) {
    assertEquals(classifyTerm(h, vocab), { kind: 'queer', slug: 'queer-friendly' }, `expected ${h} -> queer-friendly`)
  }
})

Deno.test('classifyTerm: scrape noise dropped', () => {
  for (const n of ['casual', 'trendy', 'crowded', 'eggs', 'bacon', 'salads', 'dinner', 'good-for-groups', 'brunch-food', 'gay-district', 'host-shares-gay-local-tips', 'lgbtq-venues-nearby']) {
    assertEquals(classifyTerm(n, vocab).kind, 'noise', `expected ${n} -> noise`)
  }
})

Deno.test('normalizeVenueAmenities: splits a polluted venue blob', () => {
  const out = normalizeVenueAmenities({
    category: 'bar',
    amenities: ['casual', 'trendy', 'free wifi', 'liquor', 'outdoor-seating', 'accessible', 'eggs', 'bacon', 'clothing-optional-accepted'],
    tags: ['lgbtq owned', 'crowded'],
    description: 'A gay-owned cocktail bar with a gender neutral restroom.',
  }, vocab)
  assertEquals(out.amenities, ['full-bar', 'outdoor-seating', 'wifi'])
  // Only structured terms split to accessibility; description-derived accessibility
  // is the LLM's review-gated job, not the deterministic normalizer's.
  assertEquals(out.accessibility, ['wheelchair-accessible'])
  assertEquals(out.queerTags.includes('clothing-optional'), true)
  assertEquals(out.queerTags.includes('lgbtq-owned'), true)
  // noise captured for audit
  assertEquals(out.dropped.includes('casual'), true)
  assertEquals(out.dropped.includes('eggs'), true)
})

Deno.test('normalizeVenueAmenities: empty input is safe', () => {
  const out = normalizeVenueAmenities({}, vocab)
  assertEquals(out, { amenities: [], accessibility: [], queerTags: [], dropped: [] })
})
