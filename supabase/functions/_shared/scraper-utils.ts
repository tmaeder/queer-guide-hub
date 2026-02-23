import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
]

export interface FetchOptions {
  maxRetries?: number
  delayMs?: number
  timeoutMs?: number
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<string> {
  const { maxRetries = 3, delayMs = 1000, timeoutMs = 30000 } = options
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS[attempt % USER_AGENTS.length],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.text()
    } catch (err) {
      lastError = err as Error
      console.warn(`Fetch attempt ${attempt + 1}/${maxRetries} failed for ${url}: ${lastError.message}`)
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)))
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} attempts`)
}

export type CheerioAPI = cheerio.CheerioAPI

export function parseHTML(html: string): CheerioAPI {
  return cheerio.load(html)
}

// Helper to safely extract text content, trimmed
export function extractText($el: cheerio.Cheerio<cheerio.Element>): string {
  return $el.text().trim()
}

// Helper to safely extract an attribute
export function extractAttr($el: cheerio.Cheerio<cheerio.Element>, attr: string): string | undefined {
  const val = $el.attr(attr)
  return val?.trim() || undefined
}

// Sanitize string: trim, collapse whitespace, limit length
export function sanitizeString(str: string | undefined | null, maxLength = 500): string {
  if (!str) return ''
  return str.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

// Parse a date string from various formats scrapers encounter
export function parseScrapedDate(dateStr: string): Date | null {
  if (!dateStr) return null

  // Try ISO format first
  const iso = new Date(dateStr)
  if (!isNaN(iso.getTime())) return iso

  // Try common US format: "January 15, 2026"
  const usDate = new Date(dateStr.replace(/(\d{1,2})(st|nd|rd|th)/, '$1'))
  if (!isNaN(usDate.getTime())) return usDate

  return null
}
