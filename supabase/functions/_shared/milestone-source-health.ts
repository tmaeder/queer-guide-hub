import { assertPublicHttpUrl } from './ssrf-guard.ts'
import { readProbeBody } from './probe-body.ts'

export type MilestoneSourceHealth =
  | 'healthy'
  | 'redirected'
  | 'blocked'
  | 'rate_limited'
  | 'missing'
  | 'error'
  | 'unsafe'

export interface SourceProbeResult {
  healthState: MilestoneSourceHealth
  httpStatus: number | null
  redirectUrl: string | null
  error: string | null
  bodyText: string | null
}

export function detectMilestoneDateEvidence(
  bodyText: string | null,
  milestoneDate: string,
  precision: 'day' | 'month' | 'year' | string,
): boolean {
  if (!bodyText) return false
  const [year, month, day] = milestoneDate.slice(0, 10).split('-').map(Number)
  if (!year) return false
  const normalized = bodyText.replace(/<[^<>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
  const yearPattern = new RegExp(`\\b${year}\\b`)
  if (!yearPattern.test(normalized) || precision === 'year') return yearPattern.test(normalized)

  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ]
  const monthName = monthNames[month - 1]
  const numericMonth = String(month).padStart(2, '0')
  const monthPattern = new RegExp(
    `(?:${monthName}\\s+(?:\\d{1,2}\\s*,?\\s*)?${year}|${year}[-/.]${numericMonth}(?:[-/.]\\d{1,2})?|${numericMonth}[-/.](?:\\d{1,2}[-/.])?${year})`,
  )
  if (!monthPattern.test(normalized) || precision === 'month') return monthPattern.test(normalized)

  const numericDay = String(day).padStart(2, '0')
  const dayPattern = new RegExp(
    `(?:${monthName}\\s+${day}(?:st|nd|rd|th)?\\s*,?\\s*${year}|${day}(?:st|nd|rd|th)?\\s+${monthName}\\s+${year}|${year}[-/.]${numericMonth}[-/.]${numericDay}|${numericDay}[-/.]${numericMonth}[-/.]${year})`,
  )
  return dayPattern.test(normalized)
}

export function classifyMilestoneSourceStatus(status: number): MilestoneSourceHealth {
  if (status >= 200 && status < 300) return 'healthy'
  if (status >= 300 && status < 400) return 'redirected'
  if (status === 404 || status === 410) return 'missing'
  if (status === 429) return 'rate_limited'
  if (status === 401 || status === 403 || status === 405) return 'blocked'
  return 'error'
}

/** Conservative source probe: only an explicit 404/410 is dead. */
export async function probeMilestoneSource(
  url: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<SourceProbeResult> {
  try {
    assertPublicHttpUrl(url)
  } catch (error) {
    return { healthState: 'unsafe', httpStatus: null, redirectUrl: null, error: String(error), bodyText: null }
  }

  const timeoutMs = opts.timeoutMs ?? 10_000
  const fetchImpl = opts.fetchImpl ?? fetch
  const run = (method: 'HEAD' | 'GET') =>
    fetchImpl(url, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'QueerGuide-MilestoneSourceChecker/1.0 (+https://queer.guide/about)' },
    })

  try {
    let response = await run('HEAD')
    let bodyText: string | null = null
    if ((response.status >= 200 && response.status < 300) || [401, 403, 405].includes(response.status) || response.status >= 500) {
      try {
        const get = await run('GET')
        if (get.status >= 200 && get.status < 300) {
          bodyText = new TextDecoder().decode(await readProbeBody(get, 1_000_000, true))
        } else {
          await get.body?.cancel().catch(() => {})
        }
        response = get
      } catch {
        // Preserve the explicit HEAD result; it remains indeterminate, not dead.
      }
    }
    return {
      healthState: classifyMilestoneSourceStatus(response.status),
      httpStatus: response.status,
      redirectUrl: response.headers.get('location'),
      error: null,
      bodyText,
    }
  } catch (error) {
    return { healthState: 'error', httpStatus: null, redirectUrl: null, error: String(error), bodyText: null }
  }
}
