import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseJsonObject, repairJsonControlChars } from './json-extract.ts'
import { parseQualityDecision } from './news-quality/schema.ts'

// Measured on prod 2026-09-20: 19 of 19 re-run quality completions produced a
// real answer that failed JSON.parse, and ALL NINETEEN failed on line 10 —
// `cleanedBody`, which the prompt asks for as "readable paragraphs". 14 were
// `Bad control character in string literal`, 5 `Expected ',' or '}'`.

Deno.test('THE SAFETY PROPERTY: valid JSON is returned byte-identical', () => {
  // A control character can only be invalid where this function touches it, so
  // anything that already parses must come back unchanged. This is the whole
  // argument for running the repair over every candidate.
  const samples = [
    '{"a":1}',
    '{ "a": "already \\n escaped", "b": [1, 2], "c": null }',
    // Real formatting whitespace lives BETWEEN tokens, where it is legal.
    '{\n  "a": "x",\n\t"b": false\n}',
    '{"quote": "he said \\"hi\\"", "path": "C:\\\\tmp"}',
    '{"unicode": "\\u0009 tab escape"}',
  ]
  for (const s of samples) {
    assertEquals(repairJsonControlChars(s), s, s)
    assertEquals(JSON.stringify(JSON.parse(repairJsonControlChars(s))), JSON.stringify(JSON.parse(s)))
  }
})

Deno.test('the measured defect: a literal newline inside cleanedBody now parses', () => {
  const raw = '{ "title": "T", "cleanedBody": "Para one.\nPara two.", "confidence": 0.9 }'
  assertEquals(JSON.parse(repairJsonControlChars(raw)).cleanedBody, 'Para one.\nPara two.')
})

Deno.test('every control character is escaped, not only newline', () => {
  for (const [ch, name] of [['\r', 'CR'], ['\t', 'tab'], ['\b', 'backspace'], ['\f', 'formfeed'], ['\u0001', 'SOH']] as const) {
    const parsed = JSON.parse(repairJsonControlChars(`{"v":"a${ch}b"}`))
    assertEquals(parsed.v, `a${ch}b`, name)
  }
})

Deno.test('the repair preserves the text, it does not delete the break', () => {
  // Dropping the newline would also make the JSON parse, and would silently
  // reflow the article body. The character has to survive as \n.
  const parsed = JSON.parse(repairJsonControlChars('{"body":"one\ntwo"}'))
  assertEquals(parsed.body, 'one\ntwo')
})

Deno.test('a backslash-escaped quote does not flip the in-string state', () => {
  // Getting this wrong makes the function think it is OUTSIDE a string and
  // leave the very control characters it exists to escape.
  const raw = '{"a":"say \\"x\\" then\nnewline"}'
  assertEquals(JSON.parse(repairJsonControlChars(raw)).a, 'say "x" then\nnewline')
})

Deno.test('a trailing backslash cannot run off the end', () => {
  repairJsonControlChars('{"a":"x\\')
  repairJsonControlChars('\\')
})

Deno.test('THE DELIBERATE STOP: an unescaped quote is NOT repaired', () => {
  // The usual heuristic truncates prose silently, and cleanedBody is written to
  // news_articles.content. Leaving the row unjudged is the better failure.
  const raw = '{ "cleanedBody": "she said "no" and left", "confidence": 0.9 }'
  assertEquals(parseJsonObject(raw), null)
})

Deno.test('parseJsonObject refuses anything that is not a plain object', () => {
  assertEquals(parseJsonObject('["a","b"]'), null)
  assertEquals(parseJsonObject('"a string"'), null)
  assertEquals(parseJsonObject('null'), null)
  assertEquals(parseJsonObject('42'), null)
  assert(parseJsonObject('{"a":1}') !== null)
})

Deno.test('end to end: a decision that used to be discarded is now read', () => {
  const completion = `{
  "isRelevant": true,
  "relevanceScore": 0.9,
  "qualityScoreBefore": 0.8,
  "qualityScoreAfter": 0.9,
  "shouldPublish": true,
  "needsManualReview": false,
  "title": "Court rules trans woman must face trial",
  "excerpt": "An excerpt.",
  "cleanedBody": "First paragraph of the body.\nSecond paragraph of the body.",
  "sentiment": "neutral",
  "tags": ["trans-rights"],
  "linkedCountries": [], "linkedCities": [], "linkedRegions": [],
  "linkedVenues": [], "linkedEvents": [], "linkedPersonalities": [], "linkedOrganisations": [],
  "imageAssessment": { "isUsable": true, "qualityScore": 0.8, "isRelevant": true, "needsReplacement": false, "reason": "" },
  "removedArtifacts": [], "warnings": [], "confidence": 0.9,
  "isSatire": false, "isAdvertorial": false
}`
  // Before the repair this was a bare `no_decision`.
  assertEquals(JSON.parse(repairJsonControlChars(completion)) === null, false)
  const d = parseQualityDecision(completion)
  assert(d !== null, 'expected a decision')
  assertEquals(d!.shouldPublish, true)
  assertEquals(d!.confidence, 0.9)
  assertEquals(d!.cleanedBody, 'First paragraph of the body.\nSecond paragraph of the body.')
})

Deno.test('a completion with no JSON at all still yields no decision', () => {
  assertEquals(parseQualityDecision('I am sorry, I cannot answer that.'), null)
})
