// scan-tags — turn raw extracted tags + free text into curated tag suggestions
// for the /submit scan flow. Matches against the controlled unified_tags
// vocabulary and the LGBTQ marker set; the submitter toggles the result.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { detectLgbtqMarkers } from './hotel-pipeline-utils.ts'

export interface TagSuggestion {
  slug: string
  label: string
  confidence: number
  source: 'vocab' | 'extracted' | 'marker'
  preselected: boolean
}

const KNOWN_ACRONYMS = new Map(
  ['LGBT', 'LGBTQ', 'LGBTQI', 'LGBTQIA', 'LGBTI', 'BIPOC', 'POC', 'BDSM', 'HIV',
   'AIDS', 'STI', 'NSFW', 'FTM', 'MTF', 'AFAB', 'AMAB', 'NB', 'PrEP', 'DJ', 'MC']
    .map((a) => [a.toUpperCase(), a]),
)

/** Slugify a tag. NFKD strips diacritics first so "café" → "cafe" (not "caf"). */
export function slugifyTag(input: string): string {
  return (input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Title-case a tag display label, preserving known acronyms. */
export function tagLabel(input: string): string {
  const collapsed = (input ?? '').trim().replace(/\s+/g, ' ')
  if (!collapsed) return ''
  return collapsed.replace(/[\p{L}]+/gu, (run) => {
    const canonical = KNOWN_ACRONYMS.get(run.toUpperCase())
    if (canonical) return canonical
    if (run.length >= 2 && run === run.toUpperCase()) return run
    return run.charAt(0).toUpperCase() + run.slice(1).toLowerCase()
  })
}

// Boilerplate tags that carry no discovery value — dropped before suggesting.
const STOP_SLUGS = new Set([
  'event', 'events', 'venue', 'venues', 'news', 'article', 'tag', 'tags',
  'lgbt', 'lgbtq', 'lgbtqia', 'queer', 'general', 'other', 'misc',
])

/**
 * Build curated tag suggestions for a scanned item.
 * - Raw extracted tags are slugified; those matching active unified_tags are
 *   `source:'vocab'` (preselected); unmatched ones are `source:'extracted'`.
 * - LGBTQ markers detected from title+description are `source:'marker'`
 *   (always preselected).
 * Result is de-duplicated by slug, vocab/marker winning over extracted.
 */
export async function buildTagSuggestions(
  supabase: SupabaseClient,
  rawTags: unknown,
  title?: string,
  description?: string,
): Promise<TagSuggestion[]> {
  const raw = Array.isArray(rawTags)
    ? rawTags.map((t) => String(t)).filter(Boolean)
    : typeof rawTags === 'string'
      ? rawTags.split(/[;,|]+/).map((t) => t.trim()).filter(Boolean)
      : []

  // Slug → original label, de-duped, stop-words removed.
  const candidates = new Map<string, string>()
  for (const r of raw) {
    const slug = slugifyTag(r)
    if (slug && !STOP_SLUGS.has(slug) && !candidates.has(slug)) candidates.set(slug, r)
  }

  // Single lookup against the active vocabulary.
  const vocab = new Map<string, string>() // slug → canonical name
  if (candidates.size > 0) {
    const { data } = await supabase
      .from('unified_tags')
      .select('slug, name')
      .eq('status', 'active')
      .in('slug', [...candidates.keys()])
    for (const t of data ?? []) vocab.set(t.slug, t.name ?? t.slug)
  }

  const out = new Map<string, TagSuggestion>()

  // Markers first — always preselected, highest trust.
  for (const m of detectLgbtqMarkers(raw, `${title ?? ''} ${description ?? ''}`)) {
    out.set(m, { slug: m, label: tagLabel(m.replace(/-/g, ' ')), confidence: 0.9, source: 'marker', preselected: true })
  }

  for (const [slug, original] of candidates) {
    if (out.has(slug)) continue
    if (vocab.has(slug)) {
      out.set(slug, { slug, label: vocab.get(slug)!, confidence: 0.85, source: 'vocab', preselected: true })
    } else {
      out.set(slug, { slug, label: tagLabel(original), confidence: 0.4, source: 'extracted', preselected: false })
    }
  }

  return [...out.values()]
}
