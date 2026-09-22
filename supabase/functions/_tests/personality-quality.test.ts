import { assertEquals } from 'jsr:@std/assert'
import { personalityQualityDimensions, personalityQualityScore } from '../_shared/personality-quality.ts'

Deno.test('empty record receives only neutral link/freshness/safety credit', () => {
  assertEquals(personalityQualityScore({}), 8)
})

Deno.test('name only adds partial identity credit', () => {
  assertEquals(personalityQualityScore({ name: 'Marsha P. Johnson' }), 12)
})

Deno.test('full record caps at 100', () => {
  const r = {
    name: 'Marsha P. Johnson',
    image_url: 'https://x/i.jpg',
    description: 'A'.repeat(120),
    bio: 'B'.repeat(180),
    lgbti_connection: 'activist',
    birth_date: '1945-08-24',
    profession: 'activist',
    nationality: 'American',
    wikidata_qid: 'Q464699',
    fields: ['LGBT rights'],
  }
  const dimensions = personalityQualityDimensions({
    ...r,
    source_count: 2,
    claim_source_count: 1,
    image_status: 'available',
    has_optimized_image: true,
    roles: ['activist'],
    tags: ['lgbtq-rights'],
    last_refreshed_at: new Date().toISOString(),
  })
  assertEquals(dimensions.version, 2)
  assertEquals(dimensions.cohort, 'encyclopedia')
  assertEquals(dimensions.score, 100)
  assertEquals(dimensions.hard_failures, [])
})

Deno.test('unsupported identity claim is a hard failure', () => {
  const dimensions = personalityQualityDimensions({
    name: 'X', description: 'A'.repeat(140), wikidata_qid: 'Q1',
    lgbti_connection: 'activist', source_count: 1, claim_source_count: 0,
  })
  assertEquals(dimensions.hard_failures, ['unsupported_lgbti_claim'])
})
