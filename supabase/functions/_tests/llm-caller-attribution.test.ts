/**
 * Every LLM call site must identify itself via `callerFn`.
 *
 * Without it the row lands under the client-level fallback ('llmChatCompletion'
 * or 'chatCompletion'), which tells you HOW MUCH was spent but not BY WHAT.
 * That was the state on the first day of llm_call_log: 30 rows, $0.0117, and no
 * way to attribute a penny of it to a feature. Spend you cannot attribute is
 * only marginally more useful than spend you cannot see — the $765 bill
 * (invoice IN-72568830) was found by its total, and the question that mattered
 * was always which caller produced it.
 *
 * A new edge function that calls an LLM and forgets this will fail here.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

/** Files that define the clients themselves — the fallback lives there. */
const EXEMPT = ['_shared/llm-client.ts', '_shared/openai-client.ts']

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory) { if (e.name !== '_tests') yield* walk(p) }
    else if (e.isFile && e.name.endsWith('.ts')) yield p
  }
}

Deno.test('every LLM call site passes callerFn', async () => {
  const offenders: string[] = []

  for await (const path of walk('.')) {
    const rel = path.replace(/^\.\//, '')
    if (EXEMPT.some((e) => rel.endsWith(e))) continue
    const src = await Deno.readTextFile(path)

    // An actual invocation, not a mention in a comment.
    const calls = /(?<![\w.])(llmChatCompletion|chatCompletion)\s*\(/.test(
      src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''),
    )
    if (!calls) continue
    if (!src.includes('callerFn:')) offenders.push(rel)
  }

  assertEquals(
    offenders,
    [],
    `These call an LLM without identifying themselves. Add \`callerFn: '<edge-fn-name>'\`\n` +
      `as the first option so llm_call_log can attribute the spend:\n  ${offenders.join('\n  ')}`,
  )
})
