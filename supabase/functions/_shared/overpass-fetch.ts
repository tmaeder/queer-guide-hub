// Overpass API — the I/O half. `overpass.ts` stays pure (classification and
// matching); this module is the one place that actually issues the request and
// turns a response into an answer-or-null.
//
// It exists because there were four independent Overpass integrations in this
// repo and only ONE of them classified responses correctly. The other three each
// hand-rolled `if (res.ok) return json.elements ?? []`, which records Overpass's
// own timeout signal — HTTP 200 carrying a `remark` — as "nothing is mapped
// here". Absence of evidence written down as evidence of absence.

import { classifyOverpassResponse, type OverpassVerdict } from './overpass.ts'

export interface OverpassFetchOptions {
  /** Per-request timeout. Overpass's own `[timeout:N]` should be lower. */
  perCallMs?: number
  /** Total attempts, including the first. */
  attempts?: number
  /** Base backoff, multiplied by attempt number. */
  backoffMs?: number
  userAgent?: string
  /** Appears in warnings so a failure names the city/venue it belongs to. */
  label?: string
}

export interface OverpassFetchResult {
  /** The elements, or `null` when Overpass never actually answered. */
  elements: unknown[] | null
  /** Verdict of the final attempt — why `elements` is null, when it is. */
  verdict: OverpassVerdict | 'exception'
}

const DEFAULTS = { perCallMs: 25_000, attempts: 2, backoffMs: 1_500 }
const UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'

/**
 * Query one Overpass endpoint and return elements, or null for UNKNOWN.
 *
 * `null` and `[]` are deliberately different answers and callers must keep them
 * apart: `[]` means Overpass answered and nothing is mapped; `null` means we did
 * not learn anything and must not write an absence.
 *
 * `regional` is returned as `[]` — on a planet mirror (the only kind
 * `OVERPASS_ENDPOINTS` lists) a no-remark zero really is zero. Callers that
 * probe arbitrary endpoints must check the verdict themselves rather than
 * relying on that, which is why `verdict` is returned alongside.
 */
export async function fetchOverpassElements(
  url: string,
  query: string,
  opts: OverpassFetchOptions = {},
): Promise<OverpassFetchResult> {
  const perCallMs = opts.perCallMs ?? DEFAULTS.perCallMs
  const attempts = opts.attempts ?? DEFAULTS.attempts
  const backoffMs = opts.backoffMs ?? DEFAULTS.backoffMs
  const where = opts.label ? `${opts.label} ` : ''
  let last: OverpassVerdict | 'exception' = 'exception'

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': opts.userAgent ?? UA,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(perCallMs),
      })
      let json: { elements?: unknown[]; remark?: string } | null = null
      if (res.ok) {
        // A body that will not parse is UNKNOWN, and must not reach the
        // classifier: `classifyOverpassResponse(200, null)` reads a missing
        // element list as zero elements and answers `regional`, i.e. "nothing
        // is mapped here" — the exact absence-of-evidence-as-evidence bug this
        // module exists to prevent. Caught by its own test.
        try {
          json = await res.json()
        } catch {
          console.warn(`overpass ${where}200 with an unparseable body — treating as unknown`)
          last = 'error'
          if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)))
          continue
        }
      }
      const verdict = classifyOverpassResponse(res.status, json)
      last = verdict

      if (verdict === 'ok' || verdict === 'regional') {
        return { elements: json?.elements ?? [], verdict }
      }
      if (verdict === 'busy' || verdict === 'timeout') {
        console.warn(`overpass ${where}${verdict} (HTTP ${res.status}, attempt ${attempt + 1}/${attempts})`)
        if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)))
        continue
      }
      // 4xx: the query is wrong and will be wrong next time too.
      console.warn(`overpass ${where}non-retryable HTTP ${res.status}`)
      return { elements: null, verdict }
    } catch (e) {
      last = 'exception'
      console.warn(`overpass ${where}attempt ${attempt + 1}/${attempts} threw:`, (e as Error).message)
      if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, backoffMs))
    }
  }
  return { elements: null, verdict: last }
}
