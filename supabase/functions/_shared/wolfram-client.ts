/**
 * Wolfram Alpha API client with rate limiting and response parsing.
 *
 * Primary: Full Results API (/v2/query) — structured pods
 * Fallback: Short Answers API (/v1/result) — single plaintext
 * Rate limit: 1 request/second (in-memory token bucket)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WolframPod {
  title: string
  subpods: { title: string; plaintext: string }[]
}

export interface WolframResult {
  success: boolean
  pods: WolframPod[]
  plaintext?: string
  source: 'full' | 'short' | 'none'
  inputInterpretation?: string
}

// ---------------------------------------------------------------------------
// Rate limiter (1 req/sec within a single invocation)
// ---------------------------------------------------------------------------

let lastRequestMs = 0

async function throttle(): Promise<void> {
  const now = Date.now()
  const gap = now - lastRequestMs
  if (gap < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - gap))
  }
  lastRequestMs = Date.now()
}

// ---------------------------------------------------------------------------
// Core query
// ---------------------------------------------------------------------------

export async function queryWolfram(
  input: string,
  appId: string,
): Promise<WolframResult> {
  // --- Full Results API ---
  try {
    await throttle()
    const url = new URL('https://api.wolframalpha.com/v2/query')
    url.searchParams.set('input', input)
    url.searchParams.set('appid', appId)
    url.searchParams.set('output', 'json')
    url.searchParams.set('format', 'plaintext')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      console.warn(`WA Full Results HTTP ${res.status} for "${input}"`)
    } else {
      const json = await res.json()
      const qr = json?.queryresult
      if (qr?.success && Array.isArray(qr.pods) && qr.pods.length > 0) {
        const pods: WolframPod[] = qr.pods.map((p: Record<string, unknown>) => ({
          title: p.title ?? '',
          subpods: (p.subpods ?? []).map((s: unknown) => ({
            title: s.title ?? '',
            plaintext: s.plaintext ?? '',
          })),
        }))
        return {
          success: true,
          pods,
          source: 'full',
          inputInterpretation: extractPlaintext(pods, 'Input interpretation') ?? undefined,
        }
      }
    }
  } catch (err) {
    console.warn(`WA Full Results error for "${input}":`, err)
  }

  // --- Short Answers API fallback ---
  try {
    await throttle()
    const url = new URL('https://api.wolframalpha.com/v1/result')
    url.searchParams.set('i', input)
    url.searchParams.set('appid', appId)

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
    if (res.ok) {
      const text = await res.text()
      if (text && !text.startsWith('Wolfram|Alpha did not understand')) {
        return { success: true, pods: [], plaintext: text.trim(), source: 'short' }
      }
    }
  } catch (err) {
    console.warn(`WA Short Answers error for "${input}":`, err)
  }

  return { success: false, pods: [], source: 'none' }
}

// ---------------------------------------------------------------------------
// Pod extraction helpers
// ---------------------------------------------------------------------------

/** Get plaintext from the first subpod of a pod matching `title` (case-insensitive). */
export function extractPlaintext(pods: WolframPod[], podTitle: string): string | null {
  const lower = podTitle.toLowerCase()
  const pod = pods.find((p) => p.title.toLowerCase().includes(lower))
  if (!pod || pod.subpods.length === 0) return null
  const text = pod.subpods.map((s) => s.plaintext).filter(Boolean).join('\n')
  return text || null
}

/** Get all pod titles → plaintext as a flat map. */
export function extractAllPlaintext(pods: WolframPod[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pod of pods) {
    const text = pod.subpods.map((s) => s.plaintext).filter(Boolean).join('\n')
    if (text) out[pod.title] = text
  }
  return out
}

// ---------------------------------------------------------------------------
// Numeric / unit parsing
// ---------------------------------------------------------------------------

/**
 * Parse a number from WA plaintext. Handles:
 *   "67.4 million"  → 67400000
 *   "$45,678"       → 45678
 *   "98.5%"         → 98.5
 *   "67.2 years"    → 67.2
 *   "1.234 trillion" → 1234000000000
 */
export function parseNumber(text: string): number | null {
  if (!text) return null
  // strip currency symbols, commas, unit words at end
  let s = text.replace(/[,$€£¥]/g, '').trim()

  const multipliers: Record<string, number> = {
    thousand: 1e3,
    million: 1e6,
    billion: 1e9,
    trillion: 1e12,
  }

  for (const [word, mult] of Object.entries(multipliers)) {
    if (s.toLowerCase().includes(word)) {
      s = s.replace(new RegExp(word, 'i'), '').trim()
      const n = parseFloat(s)
      return isNaN(n) ? null : n * mult
    }
  }

  // strip trailing units like "years", "km²", "%", etc.
  s = s.replace(/\s*(years|km²|mi²|m|ft|%|people|persons|inhabitants).*$/i, '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

/**
 * Parse an area value to km². Converts from mi² if needed.
 */
export function parseAreaKm2(text: string): number | null {
  if (!text) return null
  const hasMiles = /mi(le)?s?²|square\s*mi/i.test(text)
  const n = parseNumber(text)
  if (n === null) return null
  return hasMiles ? n * 2.58999 : n
}

/**
 * Parse elevation to meters. Converts from feet if needed.
 */
export function parseElevationM(text: string): number | null {
  if (!text) return null
  const hasFeet = /\bf(ee)?t\b/i.test(text)
  const n = parseNumber(text)
  if (n === null) return null
  return hasFeet ? Math.round(n * 0.3048) : n
}

/**
 * Split WA plaintext into an array (handles | , \n separators).
 */
export function parseArray(text: string): string[] {
  if (!text) return []
  return text
    .split(/[|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
