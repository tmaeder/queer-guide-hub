import { assertEquals } from 'jsr:@std/assert'
import {
  LGBTI_CONNECTION_VOCAB,
  isLgbtiConnectionVocab,
  coerceLgbtiConnection,
  deriveLgbtiConnection,
  shouldUpgradeConnection,
  deriveConnectionFromCategories,
  combineConnection,
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

Deno.test('categories: activism wins over identity, negations skipped', () => {
  // Marsha P. Johnson's real categories — activist takes precedence.
  const r = deriveConnectionFromCategories([
    'Category:American gay entertainers',
    'Category:American transgender rights activists',
    'Category:LGBTQ people from New Jersey',
  ])
  assertEquals(r.connection, 'activist')
})

Deno.test('categories: identity-only → community_member', () => {
  assertEquals(deriveConnectionFromCategories(['Category:American gay writers']).connection, 'community_member')
  assertEquals(deriveConnectionFromCategories(['Category:Lesbian musicians']).connection, 'community_member')
  assertEquals(deriveConnectionFromCategories(['Category:Transgender women']).connection, 'community_member')
})

Deno.test('categories: allies / opponents / icons are not assertions about the person', () => {
  assertEquals(deriveConnectionFromCategories(['Category:LGBT rights allies']).connection, null)
  assertEquals(deriveConnectionFromCategories(['Category:Opponents of LGBT rights']).connection, null)
  assertEquals(deriveConnectionFromCategories(['Category:American novelists']).connection, null)
  assertEquals(deriveConnectionFromCategories(['Category:Gay icons']).connection, null) // celebrated by, not member
})

Deno.test('categories: broadened identity terms (adult + bare forms)', () => {
  assertEquals(deriveConnectionFromCategories(['Category:Gay pornographic film actors']).connection, 'community_member')
  assertEquals(deriveConnectionFromCategories(['Category:Transgender models']).connection, 'community_member')
  assertEquals(deriveConnectionFromCategories(['Category:Bisexual sportspeople']).connection, 'community_member')
})

Deno.test('combine: activist from categories beats community_member from Wikidata', () => {
  const cat = deriveConnectionFromCategories(['Category:Gay rights activists'])
  const wd = deriveLgbtiConnection(['Q6636'], [])
  assertEquals(combineConnection(cat, wd).connection, 'activist')
})

Deno.test('combine: falls back to Wikidata community_member when categories are silent', () => {
  const cat = deriveConnectionFromCategories(['Category:American novelists'])
  const wd = deriveLgbtiConnection(['Q43200'], []) // bisexual
  assertEquals(combineConnection(cat, wd).connection, 'community_member')
})
