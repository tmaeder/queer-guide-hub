import { assert, assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { describeUnparseable, parseQualityDecisionPreservingBody } from './index.ts'

// Until 2026-09-19 an unreadable completion and a completion that never
// arrived both landed on the job row as the bare string `no_decision`. The
// first cut of this helper separated them and recorded the head of the text;
// measured on prod 2026-09-20 that ruled out two hypotheses and identified no
// cause, because the head is the part that is fine — all three completions
// opened with well-formed JSON and correct keys, at ~4.2 chars per output
// token with nothing near the 2,200 ceiling. So the row now carries
// `JSON.parse`'s own message, which names the cause and its offset.

Deno.test('names the parse failure, because that is the cause and the head is not', () => {
  // This case used to be a raw newline. That fault is REPAIRED now (see
  // _shared/json-extract.ts), so the assertion moved to the one the repair
  // deliberately does not touch: an unescaped quote inside a string value.
  // Valid-looking, complete, unparseable.
  const out = describeUnparseable('{"cleanedBody": "she said "no" and left"}')
  assertMatch(out, /why=[^:]*Expected/)
})

Deno.test('a cut-off answer is named as such, not as "no JSON here"', () => {
  // Every extraction stage needs a closing brace, the legacy greedy span
  // included, so a truncated object yields NO candidates at all — the same
  // count as a flat refusal. Those are different findings and the row says
  // which; leaving it to be read off the tail asks the next person to squint.
  const out = describeUnparseable('{"title": "half a decision"')
  assert(out.includes(':cands=0:'), out)
  assert(out.includes('why=unterminated_object'), out)
})

Deno.test('a refusal with no brace anywhere is distinguishable from a cut-off one', () => {
  const out = describeUnparseable('I am sorry, I cannot answer that.')
  assert(out.includes(':cands=0:'), out)
  assert(out.includes('why=no_candidates'), out)
})

Deno.test('tries every candidate, not just the best-ranked one', () => {
  // The fenced candidate and the balanced candidate fail DIFFERENTLY. Reporting
  // only the first would misattribute the failure to the fence.
  const out = describeUnparseable('```json\n{"a": nope}\n```\ntrailing {"b": "x\nz"}')
  const why = out.slice(out.indexOf('why=') + 4, out.indexOf(':tail='))
  assert(why.includes('|'), `expected two distinct parse errors, got: ${why}`)
})

Deno.test('a candidate that parses but is not an object is named, not silently dropped', () => {
  // parseQualityDecision rejects a non-object; without this the row would say
  // the text was unparseable when in fact it parsed and was the wrong shape.
  const out = describeUnparseable('```json\n["a", "b"]\n```')
  assert(out.includes('parsed_but_not_object'), out)
})

Deno.test('records the length in full, so the ratio against output tokens stays checkable', () => {
  const out = describeUnparseable('x'.repeat(1234))
  assert(out.startsWith('no_decision:len=1234:'), out.slice(0, 40))
})

Deno.test('carries the tail — the one part a head-only sample never showed', () => {
  const out = describeUnparseable('{"a": 1' + 'z'.repeat(400) + 'THE-VERY-END')
  assert(out.endsWith('THE-VERY-END'), out.slice(-40))
})

Deno.test('salvages structured fields while refusing a malformed cleaned body', () => {
  const raw = `{
    "isRelevant": true,
    "relevanceScore": 0.9,
    "qualityScoreBefore": 0.7,
    "qualityScoreAfter": 0.85,
    "shouldPublish": true,
    "needsManualReview": false,
    "title": "A real verdict",
    "excerpt": "Short summary",
    "cleanedBody": "She said "no" and left.
Second paragraph.",
    "sentiment": "neutral",
    "tags": ["news"],
    "linkedCountries": [],
    "linkedCities": [],
    "linkedRegions": [],
    "linkedVenues": [],
    "linkedEvents": [],
    "linkedPersonalities": [],
    "linkedOrganisations": [],
    "imageAssessment": {"isUsable": true, "qualityScore": 0.8, "isRelevant": true, "needsReplacement": false, "reason": ""},
    "removedArtifacts": [],
    "warnings": [],
    "confidence": 0.9,
    "isSatire": false,
    "isAdvertorial": false
  }`

  const decision = parseQualityDecisionPreservingBody(raw)
  assert(decision)
  assertEquals(decision.cleanedBody, '')
  assertEquals(decision.shouldPublish, true)
  assertEquals(decision.confidence, 0.9)
  assert(decision.warnings.includes('cleaned_body_preserved_after_json_repair'))
})

Deno.test('body salvage still refuses prose without the complete schema tail', () => {
  assertEquals(
    parseQualityDecisionPreservingBody('{"cleanedBody":"broken "quote"", "sentiment":"neutral"}'),
    null,
  )
})

Deno.test('is bounded, so one failure cannot swamp the error column', () => {
  const out = describeUnparseable('y'.repeat(50_000))
  assert(out.includes('len=50000:'))
  const tail = out.slice(out.indexOf(':tail=') + 6)
  assertEquals(tail.length, 120)
})

Deno.test('an empty completion still reports zero rather than reading as absent', () => {
  const out = describeUnparseable('')
  assert(out.startsWith('no_decision:len=0:'), out)
  assert(out.includes('cands=0'), out)
})

Deno.test('stays greppable — no newline survives into the column', () => {
  const out = describeUnparseable('Here is\n\n  my  thinking:\n\t{"a": 1,}\n\ndone')
  assert(!out.includes('\n'), out)
})

// The tests above exercise the pure helper, and mutation testing showed that is
// not enough: neutering the CALL SITE so an empty completion reports
// `undefined` (and so falls back to the bare `no_decision`) left all of them
// green. An empty body is still a body that arrived — the one case where the
// old and new strings look alike is exactly the one worth keeping apart — so
// the unconditional call is asserted against the source itself.
Deno.test('the call site describes every unparseable completion, empty included', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url))
  const body = src.slice(src.indexOf('async function callQualityLLM'))
  const statements = body
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')
  assert(
    statements.includes("unparseable: describeUnparseable(result.content ?? '')"),
    'callQualityLLM must describe the completion unconditionally, coalescing a null body to ""',
  )
  // and must not reintroduce a truthiness guard that skips the empty case
  assert(
    !/result\.content\s*\?\s*describeUnparseable/.test(statements),
    'a truthiness guard here makes an empty completion indistinguishable from no completion',
  )
})

// Mutation testing found this gap: nothing pinned the description to the same
// repair the PARSER uses, so reverting it here left every test green while the
// row reported a cause that no longer exists. A completion whose only fault is
// a literal newline inside cleanedBody is recovered now — describing it as
// "Bad control character" would send the next reader after a fixed bug.
Deno.test('describes what the PARSER sees, repair included', () => {
  const onlyFaultIsANewline = '{ "isRelevant": true, "cleanedBody": "One.\nTwo." }'
  const out = describeUnparseable(onlyFaultIsANewline)
  assert(!/control character/i.test(out), `must not report the repaired fault: ${out}`)
  assert(out.includes('parsed_as_object'), out)
})

Deno.test('a value that parses but is not an object stays distinguishable', () => {
  const out = describeUnparseable('```json\n["a", "b"]\n```')
  assert(out.includes('parsed_but_not_object'), out)
  assert(!out.includes('parsed_as_object'), out)
})

// Reaching the catch branch WITH a repairable fault needs a candidate that is
// valid-once-repaired but still not an object — a fenced array carrying a
// literal newline. Without the repair this reports "Bad control character";
// with it, the honest `parsed_but_not_object`. The object-path test above
// cannot see that branch, which is how the first mutation round missed it.
Deno.test('the repair reaches the non-object branch too', () => {
  const out = describeUnparseable('```json\n["one\ntwo"]\n```')
  assert(!/control character/i.test(out), `repaired fault must not be reported: ${out}`)
  assert(out.includes('parsed_but_not_object'), out)
})
