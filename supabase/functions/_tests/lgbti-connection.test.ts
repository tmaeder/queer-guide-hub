import { assertEquals } from 'jsr:@std/assert'
import {
  LGBTI_CONNECTION_VOCAB,
  isLgbtiConnectionVocab,
  coerceLgbtiConnection,
} from '../_shared/lgbti-connection.ts'

Deno.test('vocab is exactly the six controlled values', () => {
  assertEquals([...LGBTI_CONNECTION_VOCAB].sort(), [
    'activist', 'ally', 'community_member', 'none_known', 'representation', 'unclear',
  ])
})

Deno.test('isLgbtiConnectionVocab accepts vocab, rejects everything else', () => {
  assertEquals(isLgbtiConnectionVocab('activist'), true)
  assertEquals(isLgbtiConnectionVocab('unclear'), true)
  // The unconsented scrape labels the audit found — must be rejected.
  assertEquals(isLgbtiConnectionVocab('Gay adult performer'), false)
  assertEquals(isLgbtiConnectionVocab('lgbtq_listed_source'), false)
  assertEquals(isLgbtiConnectionVocab(''), false)
  assertEquals(isLgbtiConnectionVocab(null), false)
  assertEquals(isLgbtiConnectionVocab(undefined), false)
})

Deno.test('coerce: empty / null → no claim', () => {
  assertEquals(coerceLgbtiConnection(''), { value: null, rawOffVocab: null })
  assertEquals(coerceLgbtiConnection(null), { value: null, rawOffVocab: null })
  assertEquals(coerceLgbtiConnection('   '), { value: null, rawOffVocab: null })
})

Deno.test('coerce: exact vocab passes through', () => {
  assertEquals(coerceLgbtiConnection('ally'), { value: 'ally', rawOffVocab: null })
  assertEquals(coerceLgbtiConnection(' activist '), { value: 'activist', rawOffVocab: null })
})

Deno.test('coerce: off-vocab → unclear, raw preserved (no identity assertion)', () => {
  assertEquals(coerceLgbtiConnection('Gay adult performer'), {
    value: 'unclear',
    rawOffVocab: 'Gay adult performer',
  })
  assertEquals(coerceLgbtiConnection('lgbtq_listed_source'), {
    value: 'unclear',
    rawOffVocab: 'lgbtq_listed_source',
  })
})
