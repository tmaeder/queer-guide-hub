import { assertEquals } from 'jsr:@std/assert'
import {
  LGBTI_CONNECTION_VOCAB,
  isLgbtiConnectionVocab,
  coerceLgbtiConnection,
  deriveLgbtiConnection,
  shouldUpgradeConnection,
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

Deno.test('derive: LGBTQ+ orientation (P91) → community_member with evidence', () => {
  const r = deriveLgbtiConnection(['Q6636'], []) // homosexuality
  assertEquals(r.connection, 'community_member')
  assertEquals(r.evidence, ['P91:Q6636'])
})

Deno.test('derive: trans/non-binary gender (P21) → community_member', () => {
  assertEquals(deriveLgbtiConnection([], ['Q1052281']).connection, 'community_member') // trans woman
  assertEquals(deriveLgbtiConnection([], ['Q48270']).connection, 'community_member')   // non-binary
})

Deno.test('derive: heterosexual / cisgender → null (no claim)', () => {
  assertEquals(deriveLgbtiConnection(['Q1035954'], ['Q6581097']).connection, null) // hetero + cis male
  assertEquals(deriveLgbtiConnection([], []).connection, null)
  assertEquals(deriveLgbtiConnection(['Q999999'], []).connection, null) // unrecognised QID
})

Deno.test('derive: multiple signals accumulate evidence', () => {
  const r = deriveLgbtiConnection(['Q43200'], ['Q189125']) // bisexual + transgender
  assertEquals(r.connection, 'community_member')
  assertEquals(r.evidence.sort(), ['P21:Q189125', 'P91:Q43200'])
})

Deno.test('shouldUpgrade: only the non-committal placeholders', () => {
  assertEquals(shouldUpgradeConnection(null), true)
  assertEquals(shouldUpgradeConnection('unclear'), true)
  assertEquals(shouldUpgradeConnection('none_known'), true)
  assertEquals(shouldUpgradeConnection('activist'), false)     // curated — keep
  assertEquals(shouldUpgradeConnection('community_member'), false)
})
