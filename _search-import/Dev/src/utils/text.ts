/**
 * Text cleanup and normalisation utilities.
 */

/** Convert a string to a URL-safe slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract the hostname (without www.) from a URL. Returns null if invalid. */
export function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Strip HTML tags and collapse whitespace. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Truncate a string to maxLen characters, appending '…' if truncated. */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '…'
}

/** Deduplicate an array of strings (case-insensitive). */
export function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>()
  return arr.filter((s) => {
    const key = s.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Safely parse a URL, returning null on failure. */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    return url.toString()
  } catch {
    return null
  }
}

/** Convert country name variants to ISO-like canonical forms. */
export function canonicalCountry(raw: string): string {
  const map: Record<string, string> = {
    uk: 'United Kingdom',
    'great britain': 'United Kingdom',
    england: 'United Kingdom',
    usa: 'United States',
    us: 'United States',
    'united states of america': 'United States',
    'the netherlands': 'Netherlands',
  }
  return map[raw.toLowerCase()] ?? titleCase(raw)
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
