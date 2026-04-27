/**
 * Unit tests for the safety-relevance prompt parser. Pure logic — no env, no
 * network. Run with: cd Dev/web/supabase/functions && deno test _tests/safety-relevance.test.ts
 */
import { assertEquals, assertThrows } from 'jsr:@std/assert'
import {
  parseSafetyRelevance,
  buildSafetyRelevanceUserPrompt,
} from '../_shared/prompts/safety-relevance.ts'

Deno.test('parseSafetyRelevance: valid response', () => {
  const raw = JSON.stringify({
    queer_relevance_score: 0.85,
    queer_relevance_rationale: 'mentions pride parade',
    confidence_score: 0.9,
    safety_flags: [{ type: 'nsfw', severity: 'low', reason: 'mild innuendo' }],
    needs_human_review: false,
  })
  const r = parseSafetyRelevance(raw)
  assertEquals(r.queer_relevance_score, 0.85)
  assertEquals(r.confidence_score, 0.9)
  assertEquals(r.safety_flags.length, 1)
  assertEquals(r.safety_flags[0].type, 'nsfw')
  assertEquals(r.needs_human_review, false)
})

Deno.test('parseSafetyRelevance: strips ```json fences', () => {
  const raw = '```json\n{"queer_relevance_score":0.5,"queer_relevance_rationale":"x","confidence_score":0.7,"safety_flags":[],"needs_human_review":false}\n```'
  const r = parseSafetyRelevance(raw)
  assertEquals(r.queer_relevance_score, 0.5)
})

Deno.test('parseSafetyRelevance: drops unknown flag types and severities', () => {
  const raw = JSON.stringify({
    queer_relevance_score: 0.5,
    queer_relevance_rationale: '',
    confidence_score: 0.5,
    safety_flags: [
      { type: 'nsfw', severity: 'high', reason: 'ok' },
      { type: 'BOGUS', severity: 'high', reason: 'drop me' },
      { type: 'hate', severity: 'critical', reason: 'drop me' },
    ],
    needs_human_review: true,
  })
  const r = parseSafetyRelevance(raw)
  assertEquals(r.safety_flags.length, 1)
  assertEquals(r.safety_flags[0].type, 'nsfw')
})

Deno.test('parseSafetyRelevance: rejects out-of-range score', () => {
  const raw = JSON.stringify({
    queer_relevance_score: 1.5,
    queer_relevance_rationale: '',
    confidence_score: 0.5,
    safety_flags: [],
    needs_human_review: false,
  })
  assertThrows(() => parseSafetyRelevance(raw), Error, 'queer_relevance_score')
})

Deno.test('parseSafetyRelevance: rejects malformed JSON', () => {
  assertThrows(() => parseSafetyRelevance('not json'), SyntaxError)
})

Deno.test('buildSafetyRelevanceUserPrompt: omits empty fields', () => {
  const prompt = buildSafetyRelevanceUserPrompt({
    raw_text: 'hello',
    platform: 'telegram',
    ocr_text: null,
  })
  // Has the fields it was given
  if (!prompt.includes('<raw_text>')) throw new Error('missing raw_text')
  if (!prompt.includes('telegram')) throw new Error('missing platform')
  // Does NOT include nullish fields
  if (prompt.includes('<ocr_text>')) throw new Error('should not include null ocr_text')
  if (prompt.includes('<transcript>')) throw new Error('should not include missing transcript')
})

Deno.test('buildSafetyRelevanceUserPrompt: truncates oversized inputs', () => {
  const huge = 'x'.repeat(10000)
  const prompt = buildSafetyRelevanceUserPrompt({ raw_text: huge })
  // Default truncation is 4000 chars; ensure full 10K isn't passed through.
  if (prompt.length > 5000) throw new Error('prompt not truncated')
})
