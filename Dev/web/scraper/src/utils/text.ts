/**
 * Text cleanup and normalization utilities
 */

import * as cheerio from 'cheerio';

/**
 * Remove HTML tags and decode HTML entities. Uses cheerio's parser (which
 * handles the full set of named, numeric-decimal, and numeric-hex entities)
 * rather than the previous hand-rolled 8-entity regex chain, which dropped
 * things like &#x27;, &mdash;, &rsquo;, &hellip;, accented characters, etc.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  // cheerio.load in fragment mode; .text() returns decoded text.
  const decoded = cheerio.load(`<div>${html}</div>`, { xml: false })('div').text();
  return decoded.replace(/\s+/g, ' ').trim();
}

/** Create a URL-safe slug from text */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Normalize a venue/event name for dedup comparison */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract domain from a URL (e.g., "example.com" from "https://www.example.com/path") */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Normalize a city name for matching */
export function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trim and collapse whitespace */
export function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Truncate text to a max length, adding ellipsis if truncated */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/** Simple Jaccard similarity between two sets of words */
export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeName(a).split(' '));
  const wordsB = new Set(normalizeName(b).split(' '));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Levenshtein distance between two strings. Uses a 1-D rolling array so
 * memory is O(min(m, n)) rather than O(m*n) — matters for long addresses
 * and descriptions where the 2-D matrix can balloon to hundreds of KB.
 */
export function levenshtein(a: string, b: string): number {
  // Ensure b is the shorter string so our row array is as small as possible.
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
    // Swap prev / curr for next iteration
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/** Normalized Levenshtein similarity (0-1, higher = more similar) */
export function levenshteinSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}
