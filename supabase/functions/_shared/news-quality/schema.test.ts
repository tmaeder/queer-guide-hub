import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseQualityDecision } from './schema.ts'
import { extractBalancedObject, extractJsonCandidates } from '../json-extract.ts'

// The shapes below are what a reasoning model on the NVIDIA tier actually
// emits. Before 2026-09-19 `parseQualityDecision` ran a single greedy
// `/\{[\s\S]*\}/`, so every one of them EXCEPT the bare object parsed to null
// and the caller recorded `no_decision` — the same string it records when a
// model genuinely has no answer. Measured on prod that day: 547 successful
// completions, 268 decisions.

const DECISION = {
  isRelevant: true,
  relevanceScore: 0.91,
  shouldPublish: true,
  needsManualReview: false,
  title: 'Trump asks Supreme Court to uphold transgender military ban',
  excerpt: 'The administration filed on Friday.',
  sentiment: 'negative',
  tags: ['trans-rights', 'us-politics'],
  confidence: 0.88,
}
const BARE = JSON.stringify(DECISION)

Deno.test('bare JSON object still parses — the legacy path is unchanged', () => {
  const d = parseQualityDecision(BARE)
  assertExists(d)
  assertEquals(d.isRelevant, true)
  assertEquals(d.title, DECISION.title)
})

Deno.test('a ```json fenced block parses', () => {
  const d = parseQualityDecision('Here is the assessment:\n\n```json\n' + BARE + '\n```\n')
  assertExists(d)
  assertEquals(d.relevanceScore, 0.91)
})

Deno.test('an unfenced ``` block parses', () => {
  const d = parseQualityDecision('```\n' + BARE + '\n```')
  assertExists(d)
  assertEquals(d.shouldPublish, true)
})

Deno.test('a brace in the PROSE before a fenced block does not misdirect the parse', () => {
  // This is the case the fenced stage exists for, and the only one that
  // distinguishes it from the balanced stage. Mutation testing caught that the
  // two tests above pass with the fenced stage removed — the balanced scan
  // finds the object inside the fence by itself. Here the reasoning text opens
  // a brace first, so the balanced scan starts in the wrong place and only the
  // fence gets the real object.
  const content =
    'I will use the schema {isRelevant, relevanceScore, ...} as follows.\n\n' +
    '```json\n' + BARE + '\n```'
  const d = parseQualityDecision(content)
  assertExists(d)
  assertEquals(d.title, DECISION.title)
  assertEquals(d.relevanceScore, 0.91)
})

Deno.test('prose BEFORE and AFTER the object parses — the greedy span cannot', () => {
  // The trailing sentence contains a brace, so first-'{'-to-last-'}' captures
  // the closing remark too and JSON.parse throws. This is the dominant shape.
  const content =
    'Let me think about this step by step.\n' + BARE +
    '\nThat completes the object {as requested}.'
  assertEquals(JSON.parse(JSON.stringify(content)).length > 0, true)
  const d = parseQualityDecision(content)
  assertExists(d)
  assertEquals(d.title, DECISION.title)
})

Deno.test('a brace inside a quoted value does not end the object early', () => {
  const tricky = JSON.stringify({ ...DECISION, excerpt: 'He said {this} loudly' })
  const d = parseQualityDecision('Reasoning first.\n' + tricky + '\nDone.')
  assertExists(d)
  assertEquals(d.excerpt, 'He said {this} loudly')
})

Deno.test('genuinely unparseable output still returns null', () => {
  // The gate must keep failing when there is really no answer — otherwise the
  // fix would manufacture verdicts, which is worse than losing them.
  assertEquals(parseQualityDecision('I am unable to assess this article.'), null)
  assertEquals(parseQualityDecision(''), null)
  assertEquals(parseQualityDecision('{ this is not json'), null)
})

Deno.test('a JSON array is rejected rather than coerced into a decision', () => {
  assertEquals(parseQualityDecision('[1,2,3]'), null)
})

Deno.test('extractBalancedObject stops at the matching brace, not the last one', () => {
  const s = 'x {"a":1} y {"b":2} z'
  assertEquals(extractBalancedObject(s), '{"a":1}')
})

Deno.test('extractJsonCandidates keeps the greedy span as the final candidate', () => {
  // Load-bearing: it is the behaviour every existing caller has today, so the
  // adoption is strictly additive.
  const cands = extractJsonCandidates('a {"a":1} b {"b":2} c')
  assertEquals(cands[cands.length - 1], '{"a":1} b {"b":2}')
})
