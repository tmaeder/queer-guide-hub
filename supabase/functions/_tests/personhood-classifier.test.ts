// Unit tests for the personhood classifier fusion logic.
// Wikidata + LLM are injected so no network is touched.
// Run with: cd supabase/functions && deno test _tests/personhood-classifier.test.ts
import { assertEquals, assert } from 'jsr:@std/assert'
import {
  classifyPersonhood,
  heuristicPersonhood,
  type LlmPersonhood,
  type PersonhoodInput,
} from '../_shared/personhood-classifier.ts'
import type { WikidataPersonhood } from '../_shared/wikidata-resolve.ts'

const wdMiss = (): Promise<WikidataPersonhood> =>
  Promise.resolve({ found: false, isHuman: false, nonPersonType: null, matchConfidence: 0 })
const wdHuman = (): Promise<WikidataPersonhood> =>
  Promise.resolve({ found: true, qid: 'Q42', label: 'X', isHuman: true, nonPersonType: null, matchConfidence: 0.95 })
const wdOrg = (type: 'organization' | 'team' | 'venue') => (): Promise<WikidataPersonhood> =>
  Promise.resolve({ found: true, qid: 'Q1', label: 'X', isHuman: false, nonPersonType: type, matchConfidence: 0.95 })

const llmPerson = (): Promise<LlmPersonhood> => Promise.resolve({ isPerson: true, type: 'person', confidence: 0.9 })
const llmOrg = (type: LlmPersonhood['type']) => (): Promise<LlmPersonhood> =>
  Promise.resolve({ isPerson: false, type, confidence: 0.95 })
const llmNull = () => Promise.resolve(null)

// --- heuristics -------------------------------------------------------------

Deno.test('heuristic: birth/death date is a strong person marker', () => {
  const h = heuristicPersonhood({ name: 'Jane Doe', hasDates: true })
  assertEquals(h.lean, 'person')
  assert(h.weight >= 0.7)
})

Deno.test('heuristic: org name token + org bio → strong non_person', () => {
  const h = heuristicPersonhood({
    name: 'San Francisco Tsunami Water Polo',
    bio: 'San Francisco Tsunami Water Polo is a gay and lesbian water polo team based in San Francisco.',
  })
  assertEquals(h.lean, 'non_person')
  assert(h.weight >= 0.6)
})

// --- fusion -----------------------------------------------------------------

Deno.test('fusion: Wikidata human vetoes noisy name tokens', async () => {
  // Name has an org-ish token but Wikidata says it is a human.
  const r = await classifyPersonhood(
    { name: 'House of Versace', bio: 'is a fashion designer' },
    { wikidata: wdHuman, llm: llmPerson },
  )
  assertEquals(r.verdict, 'person')
})

Deno.test('fusion: org bio + LLM org + Wikidata org → archive-grade non_person', async () => {
  const input: PersonhoodInput = {
    name: 'The Sisters of Perpetual Indulgence',
    bio: 'The Sisters of Perpetual Indulgence is a charitable organization and support group.',
  }
  const r = await classifyPersonhood(input, { wikidata: wdOrg('organization'), llm: llmOrg('organization') })
  assertEquals(r.verdict, 'non_person')
  assert(r.confidence >= 0.8, `confidence ${r.confidence} should clear archive threshold`)
  assertEquals(r.suggestedType, 'organization')
})

Deno.test('fusion: venue described by activity, no name token, LLM venue → non_person', async () => {
  const r = await classifyPersonhood(
    { name: 'La Montaña', bio: 'La Montaña in La Gomera offers original and home-cooked meals.' },
    { wikidata: wdMiss, llm: llmOrg('venue') },
  )
  assertEquals(r.verdict, 'non_person')
  assertEquals(r.suggestedType, 'venue')
})

Deno.test('fusion: bare name, no signal, no Wikidata → uncertain (never archived)', async () => {
  const r = await classifyPersonhood(
    { name: 'Maria Gonzalez', bio: null },
    { wikidata: wdMiss, llm: llmNull },
  )
  assert(r.verdict !== 'non_person', 'bare ambiguous name must not be flagged non_person')
})

Deno.test('fusion: real person bio + LLM person → person', async () => {
  const r = await classifyPersonhood(
    { name: 'Azealia Banks', bio: 'Azealia Amanda Banks is an American rapper, singer, and songwriter.' },
    { wikidata: wdHuman, llm: llmPerson },
  )
  assertEquals(r.verdict, 'person')
})

Deno.test('fusion: a single weak org signal stays below archive threshold', async () => {
  // Only the LLM leans org with modest confidence; nothing else corroborates.
  const r = await classifyPersonhood(
    { name: 'The Foundation', bio: 'A short ambiguous note about a foundation.' },
    { wikidata: wdMiss, llm: () => Promise.resolve({ isPerson: false, type: 'organization', confidence: 0.5 }) },
  )
  // Should not reach archive-grade confidence on one weak vote.
  assert(!(r.verdict === 'non_person' && r.confidence >= 0.8), `weak single vote reached archive grade: ${JSON.stringify(r)}`)
})
