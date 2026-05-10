// Canonical copy lives at Dev/src/utils/text.ts — keep in sync.
import * as cheerio from 'cheerio';

/** Convert a string to a URL-safe slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalize a venue/event name for dedup comparison. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a city name for matching. */
export function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract the hostname (without www.) from a URL. */
export function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Strip HTML tags and decode entities via cheerio. */
export function stripHtml(html: string): string {
  if (!html) return '';
  const decoded = cheerio.load(`<div>${html}</div>`, { xml: false })('body > div').first().text();
  return decoded.replace(/\s+/g, ' ').trim();
}

/** Truncate a string to maxLen characters, appending ellipsis if truncated. */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '…'
}

/** Trim and collapse whitespace. */
export function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
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

/** Simple Jaccard similarity between two sets of words. */
export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeName(a).split(' '));
  const wordsB = new Set(normalizeName(b).split(' '));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Levenshtein distance. O(min(m, n)) memory via rolling array.
 */
export function levenshtein(a: string, b: string): number {
  if (a.length < b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }
  const m = a.length;
  const n = b.length;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/** Normalized Levenshtein similarity (0–1, higher = more similar). */
export function levenshteinSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}
