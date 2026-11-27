import type { QualityDecision } from './schema.ts'
import { cleanNewsBody, cleanNewsText } from './text-cleanup.ts'

// A quality model judges publication; publisher wording always comes from the
// source. Its rewritten body must never flatten paragraphs or replace quotes.
export function preserveSourceWording(decision: QualityDecision, source: { title: string; content: string; excerpt?: string | null }): QualityDecision {
  // Preserve the empty-extraction signal; source text must not turn an absent
  // model verdict into a confident relevance rejection.
  if (decision.confidence === 0 && !decision.title.trim() && !decision.cleanedBody.trim() && !decision.excerpt.trim()) return decision
  const title = cleanNewsText(source.title, { field: 'title' })
  return {
    ...decision,
    title,
    cleanedBody: cleanNewsBody(source.content, source.excerpt ?? '', title),
    excerpt: cleanNewsText(source.excerpt ?? '', { field: 'excerpt' }),
  }
}

// Re-run corrected rules against the snapshot only while the field still has
// our old output. A subsequent human edit is the source of truth.
export function cleanupSource(current: string | null, original: string | null | undefined, previousCleaned: string | null | undefined): string | null {
  return current === previousCleaned && original !== undefined ? original : current
}
