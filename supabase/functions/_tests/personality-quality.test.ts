import { assertEquals } from 'jsr:@std/assert'
import { personalityQualityScore } from '../_shared/personality-quality.ts'

Deno.test('empty record scores 0', () => {
  assertEquals(personalityQualityScore({}), 0)
})

Deno.test('name only scores 5', () => {
  assertEquals(personalityQualityScore({ name: 'Marsha P. Johnson' }), 5)
})

Deno.test('full record caps at 100', () => {
  const r = {
    name: 'Marsha P. Johnson',
    image_url: 'https://x/i.jpg',
    description: 'A'.repeat(120),
    lgbti_connection: 'activist',
    birth_date: '1945-08-24',
    profession: 'activist',
    nationality: 'American',
    wikidata_qid: 'Q464699',
    fields: ['LGBT rights'],
  }
  assertEquals(personalityQualityScore(r), 100)
})

Deno.test('partial: image+desc>80+qid = 15+20+15 = 50', () => {
  assertEquals(personalityQualityScore({
    name: 'X', image_url: 'u', description: 'A'.repeat(90), wikidata_qid: 'Q1',
  }), 5 + 15 + 20 + 15)
})
