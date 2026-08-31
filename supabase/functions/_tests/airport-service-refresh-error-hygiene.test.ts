/**
 * Guards the two faults fixed in `airport-service-refresh` on 2026-08-28.
 *
 * 1. CWE-209. CodeQL alert 73 (`js/stack-trace-exposure`) traced
 *    `String(e)` at index.ts:157 into `JSON.stringify` inside `jsonResponse`.
 *    The two sibling exits on the same handler -- `error.message` from the
 *    upsert and the prune -- were NOT flagged, because a PostgREST error is not
 *    stack-trace-derived as far as CodeQL is concerned. They were the worse
 *    leak: a Postgres message names columns, relations and constraints. When a
 *    taint alert names one call site, the rest of the file has to be read by
 *    hand; that is what this test freezes.
 *
 * 2. False-green run tracking. Every failure exit returned HTTP 200. This is a
 *    tracked automation, and `admin_automation_reap_runs()` decides error on
 *    `status_code >= 400 OR error_msg IS NOT NULL`, while a success RESETS
 *    `consecutive_failures`. A 200 on failure meant a broken monthly refresh
 *    was recorded as healthy and auto-pause could never fire.
 *
 * Scope is deliberately this one file. The same raw-error-into-response shape
 * exists at ~94 other sites across ~65 edge functions; sweeping them needs a
 * per-handler decision about which literals are a consumer contract (see
 * `_shared/safe-error.ts`), so a repo-wide assertion here would be one that
 * cannot pass. This guards the file that was actually audited.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

const FN = 'airport-service-refresh/index.ts'

/** Strip comments so prose about the bug never satisfies or trips a check. */
function code(src: string): string {
  return src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

async function source(): Promise<string> {
  return code(await Deno.readTextFile(FN))
}

Deno.test('no raw error text reaches a response body', async () => {
  const src = await source()

  // Any response call whose arguments carry an unsanitised error value.
  const offenders = [...src.matchAll(/(?:jsonResponse|errorResponse)\s*\([\s\S]{0,220}?\)/g)]
    .map((m) => m[0])
    .filter((call) => /String\s*\(\s*e\s*\)|\b(?:e|err|error|delErr|upErr)\.message\b/.test(call))

  assertEquals(
    offenders,
    [],
    `${FN}: raw error text in a response body (CWE-209). Wrap it in safeErrCode() ` +
      `from _shared/safe-error.ts so only a code we chose is returned.`,
  )
})

Deno.test('error exits are sanitised through safeErrCode', async () => {
  const src = await source()
  // The three audited failure exits each carry a chosen code plus a safe detail.
  for (const codeName of ['ourairports_unavailable', 'upsert_failed', 'prune_failed']) {
    const call = src.match(new RegExp(`\\{[^{}]*'${codeName}'[\\s\\S]{0,200}?\\}`))
    if (!call) throw new Error(`${FN}: expected a failure exit carrying '${codeName}'`)
    if (!/safeErrCode\s*\(/.test(call[0])) {
      throw new Error(`${FN}: the '${codeName}' exit no longer sanitises its detail via safeErrCode()`)
    }
  }
})

Deno.test('every failure exit returns a countable non-2xx status', async () => {
  const src = await source()

  // Each response literal that declares an `error:` field, with its status arg.
  const bad: string[] = []
  for (const m of src.matchAll(/jsonResponse\s*\(\s*(\{[\s\S]*?\})\s*,\s*(\d{3})\s*,/g)) {
    const [, body, status] = m
    if (!/\berror\s*:/.test(body)) continue
    if (Number(status) < 400) {
      bad.push(`${body.replace(/\s+/g, ' ').slice(0, 70)}... -> ${status}`)
    }
  }

  assertEquals(
    bad,
    [],
    `${FN}: a failure exit returns a 2xx. admin_automation_reap_runs() counts ` +
      `only status_code >= 400 as an error, and a success resets ` +
      `consecutive_failures -- so a 2xx here makes a broken run read as healthy.`,
  )
})
