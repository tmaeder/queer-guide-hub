import { personAuthorCandidate } from '../news-author.ts'
// Deterministic news content sanitizer.
// Pure functions — no AI, no IO. Safe to run on every staging row.

import {
  EXACT_PHRASES,
  TRUNCATION_MARKERS,
  CRITICAL_PAYWALL_MARKERS,
  JUNK_PHRASES_VERSION,
} from './junk-phrases.ts'
import { detectCodeResidue, stripCodeResidue, stripRawTextElements } from './code-residue.ts'
import { cleanNewsBody, cleanNewsText, newsCleanupSafetyIssues, newsTextIssues, newsHtmlToText } from './text-cleanup.ts'
export { decodeHtmlEntities } from './html-entities.ts'

export interface SanitizeResult {
  title: string
  content: string
  excerpt: string
  author: string
  removedArtifacts: string[]
  truncated: boolean
  criticalPaywall: boolean
  // Code signals STILL present after stripping — a leak shape the scrubber does not
  // understand yet. Blocks auto-publish so it surfaces in review instead of on the page.
  codeResidue: boolean
  changed: boolean
  version: string
  textIssues: string[]
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function stripJunkPhrases(text: string): { text: string; removed: string[] } {
  if (!text) return { text: '', removed: [] }
  const out = cleanNewsText(text)
  const removed = EXACT_PHRASES.filter(phrase => text.toLowerCase().includes(phrase.toLowerCase()) && !out.toLowerCase().includes(phrase.toLowerCase()))
  return { text: out, removed: removed.length ? [...removed] : out === text ? [] : ['publisher_clutter_or_markup'] }
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

export function stripHtmlTags(html: string): string {
  return newsHtmlToText(html)
}

export function cleanTitle(raw: string): string {
  if (!raw) return ''
  return cleanNewsText(raw, { field: 'title' })
}

// Decode + strip a short text field (excerpt, author). Mirrors the body loop but
// without junk-phrase removal: runs decode→strip→decode until stable so
// entity-encoded tags (&lt;p&gt;) and double-encoded entities (&amp;#39;) resolve,
// then collapses whitespace. Single-line by default so bylines stay one line.
export function cleanShortText(raw: string, singleLine = false): string {
  if (!raw) return ''
  const text = cleanNewsText(raw)
  return singleLine ? text.replace(/\s+/g, ' ').trim() : text
}

export function cleanExcerpt(raw: string): string {
  return cleanNewsText(raw || '', { field: 'excerpt' }).slice(0, 600)
}

export function cleanAuthorField(raw: string): string {
  return personAuthorCandidate(cleanShortText(raw || '', true).slice(0, 200)) ?? ''
}

export function sanitizeArticle(
  input: { title: string; content: string; excerpt?: string; author?: string },
): SanitizeResult {
  const removed: string[] = []
  const cleanedTitle = cleanTitle(input.title || '')
  if (cleanedTitle !== (input.title || '').trim()) removed.push('title:reformatted')

  const cleanedExcerpt = cleanExcerpt(input.excerpt || '')
  if (cleanedExcerpt !== (input.excerpt || '').trim()) removed.push('excerpt:cleaned')
  const cleanedAuthor = cleanAuthorField(input.author || '')
  if (cleanedAuthor !== (input.author || '').trim()) removed.push('author:cleaned')

  const body = cleanNewsBody(input.content || '', input.excerpt ?? '', cleanedTitle)
  if (body !== (input.content || '')) removed.push('body:formatting_or_clutter')
  if (newsHtmlToText(input.content || '') !== (input.content || '')) removed.push('html_tags')
  if (stripCodeResidue(input.content || '').removed || stripRawTextElements(input.content || '') !== (input.content || '')) removed.push('code_residue')
  const truncated = detectTruncation(body)
  const criticalPaywall = hasCriticalPaywall(input.content || '')

  const changed =
    cleanedTitle !== (input.title || '') ||
    body !== (input.content || '') ||
    cleanedExcerpt !== (input.excerpt || '') ||
    cleanedAuthor !== (input.author || '') ||
    removed.length > 0

  return {
    title: cleanedTitle,
    content: body,
    excerpt: cleanedExcerpt,
    author: cleanedAuthor,
    removedArtifacts: removed,
    truncated,
    criticalPaywall,
    codeResidue: detectCodeResidue(body),
    changed,
    version: JUNK_PHRASES_VERSION,
    textIssues: [...newsTextIssues(body), ...newsCleanupSafetyIssues(input.content || '', body)],
  }
}
