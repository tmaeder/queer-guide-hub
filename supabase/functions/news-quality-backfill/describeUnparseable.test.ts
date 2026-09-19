import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { describeUnparseable } from './index.ts'

// Until 2026-09-19 an unreadable completion and a completion that never
// arrived both landed on the job row as the bare string `no_decision`. Three
// articles re-run after the json-extract fix proved they are different facts:
// all three produced real Cloudflare completions (673/688/1229 output tokens,
// none truncated at the 2200 ceiling) and all three still recorded
// `no_decision`, so the row carried no evidence about what defeated the parse.

Deno.test('records the length, so a truncated body is distinguishable from a wrapped one', () => {
  const out = describeUnparseable('x'.repeat(1234))
  assert(out.startsWith('no_decision:len=1234:'), out.slice(0, 40))
})

Deno.test('keeps the sample greppable — newlines and runs collapse to single spaces', () => {
  const out = describeUnparseable('Here is\n\n  my  thinking:\n\t{"a": 1}')
  assertEquals(out, `no_decision:len=34:Here is my thinking: {"a": 1}`)
  assert(!out.includes('\n'))
})

Deno.test('is bounded, so one failure cannot swamp the error column', () => {
  const out = describeUnparseable('y'.repeat(50_000))
  // prefix + 240 chars of sample; the length is still reported in full.
  assert(out.includes('len=50000:'))
  assertEquals(out.split(':').slice(2).join(':').length, 240)
})

Deno.test('an empty completion still reports zero rather than reading as absent', () => {
  assertEquals(describeUnparseable(''), 'no_decision:len=0:')
})

// The three tests above exercise the pure helper, and mutation testing showed
// that is not enough: neutering the CALL SITE so an empty completion reports
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
