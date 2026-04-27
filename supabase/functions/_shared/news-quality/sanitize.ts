// Deterministic news content sanitizer.
// Pure functions — no AI, no IO. Safe to run on every staging row.

import {
  EXACT_PHRASES,
  PATTERN_PHRASES,
  TRUNCATION_MARKERS,
  CRITICAL_PAYWALL_MARKERS,
  JUNK_PHRASES_VERSION,
} from './junk-phrases.ts'

export interface SanitizeResult {
  title: string
  content: string
  removedArtifacts: string[]
  truncated: boolean
  criticalPaywall: boolean
  changed: boolean
  version: string
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function stripJunkPhrases(text: string): { text: string; removed: string[] } {
  if (!text) return { text: '', removed: [] }
  const removed: string[] = []
  let out = text

  for (const phrase of EXACT_PHRASES) {
    const re = new RegExp(escapeRegExp(phrase), 'gi')
    if (re.test(out)) {
      removed.push(phrase)
      out = out.replace(re, ' ')
    }
  }

  for (const re of PATTERN_PHRASES) {
    if (new RegExp(re.source, re.flags).test(out)) {
      removed.push(`pattern:${re.source.slice(0, 40)}`)
      out = out.replace(new RegExp(re.source, re.flags), ' ')
    }
  }

  return { text: out, removed }
}

export function detectTruncation(body: string): boolean {
  if (!body) return false
  const trimmed = body.trim()
  if (trimmed.length < 280) return true // suspiciously short for a news article
  return TRUNCATION_MARKERS.some((re) => re.test(trimmed))
}

export function hasCriticalPaywall(text: string): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return CRITICAL_PAYWALL_MARKERS.some((m) => lower.includes(m.toLowerCase()))
}

export function collapseDuplicateHeadings(content: string, title?: string): string {
  if (!content) return ''
  let out = content

  // Strip leading occurrences of the article title repeated as a heading.
  if (title) {
    const titleEsc = escapeRegExp(title.trim())
    out = out.replace(
      new RegExp(`^(\\s*(?:#+\\s*)?${titleEsc}\\s*\\n+){1,3}`, 'i'),
      '',
    )
  }

  // Collapse exact consecutive duplicate lines (e.g. broken extractors emitting the same heading twice).
  out = out.replace(/^([^\n]{4,})\n\1(\n|$)/gm, '$1$2')

  return out
}

export function normalizeWhitespace(s: string): string {
  if (!s) return ''
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function cleanTitle(raw: string): string {
  if (!raw) return ''
  let t = raw.trim()
  t = t.replace(/^\[?(semi-satire|satire|parody|sponsored|advertorial)\]?\s*[:-]?\s*/i, '')
  t = t.replace(/\s+\|\s+[^|]+$/, '') // strip trailing " | Source Name"
  t = t.replace(/\s+[—–-]\s+[^—–-]+$/, '') // strip trailing " — Source"
  t = t.replace(/\s+/g, ' ').trim()
  // Sentence-case all-caps headlines (preserve acronyms 2-4 chars).
  if (t.length > 8 && t === t.toUpperCase()) {
    t = t
      .toLowerCase()
      .replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase())
      .replace(/\b(lgbt[qia+]*|hiv|aids|eu|us|usa|uk|un|who|cdc|nyc|sf)\b/gi, (m) => m.toUpperCase())
  }
  return t.slice(0, 240)
}

export function sanitizeArticle(input: { title: string; content: string }): SanitizeResult {
  const removed: string[] = []
  const cleanedTitle = cleanTitle(input.title || '')
  if (cleanedTitle !== (input.title || '').trim()) removed.push('title:reformatted')

  const stripBody = stripJunkPhrases(input.content || '')
  removed.push(...stripBody.removed)
  let body = stripBody.text
  body = collapseDuplicateHeadings(body, cleanedTitle)
  body = normalizeWhitespace(body)

  const truncated = detectTruncation(body)
  const criticalPaywall = hasCriticalPaywall(input.content || '')

  const changed =
    cleanedTitle !== (input.title || '') || body !== (input.content || '') || removed.length > 0

  return {
    title: cleanedTitle,
    content: body,
    removedArtifacts: removed,
    truncated,
    criticalPaywall,
    changed,
    version: JUNK_PHRASES_VERSION,
  }
}
