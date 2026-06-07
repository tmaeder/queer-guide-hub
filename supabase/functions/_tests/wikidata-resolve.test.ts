import { assertEquals, assert } from 'jsr:@std/assert'
import {
  normalizeName,
  langsForNationality,
  nationalityMatches,
  yearOf,
  keywordsFor,
  scoreCandidate,
  pickBest,
  type SeedNorm,
  type CandidateEvidence,
  type CandidateScore,
} from '../_shared/wikidata-resolve.ts'

// ---- normalizeName ----
Deno.test('normalizeName strips punctuation, accents, case', () => {
  assertEquals(normalizeName('Marsha P. Johnson'), 'marsha p johnson')
  assertEquals(normalizeName('José Sarria'), 'jose sarria')
  assertEquals(normalizeName("O'Hara-Smith"), 'o hara smith')
})

// ---- langsForNationality ----
Deno.test('langsForNationality always includes en, adds national language', () => {
  assertEquals(langsForNationality(null), ['en'])
  assertEquals(langsForNationality('German'), ['en', 'de'])
  assertEquals(langsForNationality('American'), ['en']) // english already
  assertEquals(langsForNationality('Brazilian'), ['en', 'pt'])
})

// ---- nationalityMatches ----
Deno.test('nationalityMatches handles demonyms and direct', () => {
  assert(nationalityMatches('American', 'United States of America'))
  assert(nationalityMatches('German', 'Germany'))
  assert(nationalityMatches('France', 'France'))
  assertEquals(nationalityMatches('German', 'France'), false)
})

// ---- yearOf ----
Deno.test('yearOf parses wikidata times and plain dates', () => {
  assertEquals(yearOf('+1945-08-24T00:00:00Z'), 1945)
  assertEquals(yearOf('1992-07-06'), 1992)
  assertEquals(yearOf(null), null)
})

// ---- keywordsFor ----
Deno.test('keywordsFor maps known professions and falls back', () => {
  assert(keywordsFor('activist').includes('campaigner'))
  assert(keywordsFor('drag performer').includes('drag'))
  assertEquals(keywordsFor(null), [])
  assertEquals(keywordsFor('astronaut'), ['astronaut']) // fallback to itself
})

const seed = (over: Partial<SeedNorm> = {}): SeedNorm => ({
  name: 'Marsha P. Johnson',
  professionKeywords: keywordsFor('activist'),
  birthYear: 1945,
  deathYear: 1992,
  nationality: 'american',
  isLiving: false,
  ...over,
})

const ev = (over: Partial<CandidateEvidence> = {}): CandidateEvidence => ({
  isHuman: true,
  label: 'Marsha P. Johnson',
  aliases: [],
  birthYear: 1945,
  deathYear: 1992,
  occupations: ['activist'],
  nationalities: ['united states of america'],
  ...over,
})

// ---- scoreCandidate ----
Deno.test('full corroboration scores high, not contradicted', () => {
  const s = scoreCandidate(seed(), ev())
  assertEquals(s.contradicted, false)
  assert(s.score >= 0.85)
  assert(s.hardCorroborated)
  assert(s.nameExact)
})

Deno.test('non-human is hard-rejected', () => {
  const s = scoreCandidate(seed(), ev({ isHuman: false }))
  assert(s.contradicted)
})

Deno.test('birth-year conflict contradicts even with matching name', () => {
  const s = scoreCandidate(seed(), ev({ birthYear: 1970 }))
  assert(s.contradicted)
  assert(s.reasons.includes('birthyear-conflict'))
})

Deno.test('occupation conflict vetoes only without birth corroboration', () => {
  const noBirthSeed = seed({ birthYear: null })
  const withWrongOcc = ev({ birthYear: null, occupations: ['basketball player'] })
  assert(scoreCandidate(noBirthSeed, withWrongOcc).contradicted)

  // but if birth year corroborates, a divergent occupation is tolerated
  const tolerated = scoreCandidate(seed(), ev({ occupations: ['basketball player'] }))
  assertEquals(tolerated.contradicted, false)
  assert(tolerated.reasons.includes('occupation-divergent-ignored'))
})

Deno.test('name mismatch yields no name signal', () => {
  const s = scoreCandidate(seed(), ev({ label: 'Someone Else', aliases: [] }))
  assert(s.reasons.includes('name-mismatch'))
})

// ---- pickBest ----
const sc = (over: Partial<CandidateScore & { qid: string }>): CandidateScore & { qid: string } => ({
  qid: 'Q1', score: 0.9, contradicted: false,
  reasons: ['name-exact', 'birthyear-match'], hardCorroborated: true, nameExact: true,
  ...over,
})

Deno.test('pickBest accepts a corroborated unique match', () => {
  const r = pickBest(seed(), [sc({})], 1)
  assert(r)
  assertEquals(r!.confidence, 'high')
})

Deno.test('pickBest rejects contradicted candidates', () => {
  const r = pickBest(seed(), [sc({ contradicted: true })], 1)
  assertEquals(r, null)
})

Deno.test('pickBest refuses living person on name alone', () => {
  const livingSeed = seed({ isLiving: true })
  const nameOnly = sc({ score: 0.4, reasons: ['name-exact'], hardCorroborated: false })
  assertEquals(pickBest(livingSeed, [nameOnly], 1), null)
})

Deno.test('pickBest accepts dead figure on sole exact name', () => {
  const nameOnly = sc({ score: 0.4, reasons: ['name-exact'], hardCorroborated: false })
  const r = pickBest(seed({ isLiving: false }), [nameOnly], 1)
  assert(r) // sole exact name, dead
})

Deno.test('pickBest refuses ambiguous near-ties', () => {
  const a = sc({ qid: 'Q1', score: 0.6, hardCorroborated: true, reasons: ['name-exact'] })
  const b = sc({ qid: 'Q2', score: 0.55, hardCorroborated: true, reasons: ['name-exact'] })
  assertEquals(pickBest(seed(), [a, b], 2), null) // margin < 0.25
})

Deno.test('pickBest never accepts a pure name-mismatch even if score high', () => {
  const mism = sc({ score: 0.9, reasons: ['birthyear-match'], nameExact: false })
  assertEquals(pickBest(seed(), [mism], 1), null)
})
