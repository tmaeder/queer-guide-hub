/**
 * supabase-js `functions.invoke` sends `x-client-info` (client default headers)
 * and `apikey` (fetchWithAuth) on every call, so the browser's CORS preflight
 * asks for both. A function that answers with a narrower
 * Access-Control-Allow-Headers is unreachable from the site: the browser
 * blocks the request before it is sent.
 *
 * Nine functions shipped with 'authorization, content-type' (the trip AI
 * planner, concierge, cost estimate, recap, safety narrative, nudges, packing
 * suggestions, document extraction, story narration). Verified on queer.guide:
 * ai-plan-trip and trip-recap failed with "Failed to fetch" while a function on
 * the shared header list answered. This guard covers every function source.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

const REQUIRED = ['authorization', 'x-client-info', 'apikey', 'content-type']

async function* sources(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory && !e.name.startsWith('.') && e.name !== 'node_modules') yield* sources(p)
    else if (e.isFile && p.endsWith('.ts') && !p.endsWith('.test.ts')) yield p
  }
}

Deno.test('every Access-Control-Allow-Headers admits the supabase-js headers', async () => {
  const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
  const offenders: string[] = []
  let seen = 0
  for await (const f of sources(root)) {
    const src = (await Deno.readTextFile(f)).replace(/\/\/[^\n]*/g, '')
    for (const m of src.matchAll(/['"]Access-Control-Allow-Headers['"]\s*:\s*['"`]([^'"`]+)['"`]/gi)) {
      seen++
      const have = m[1].toLowerCase().split(',').map((s) => s.trim())
      const missing = REQUIRED.filter((h) => !have.includes(h))
      if (missing.length) offenders.push(`${f.slice(root.length + 1)}: missing ${missing.join(', ')}`)
    }
  }
  // Positive control: the shared helper alone declares one, so an empty scan is a broken scan.
  if (seen < 1) throw new Error('scanned no Access-Control-Allow-Headers at all')
  assertEquals(offenders, [], 'these block every browser call made through supabase.functions.invoke')
})
