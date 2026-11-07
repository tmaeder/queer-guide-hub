import { sanitizeArticle } from '../_shared/news-quality/sanitize.ts'

export function hasCompletePodcastNotes(normalized: Record<string, unknown>, content: string): boolean {
  const metadata = normalized.metadata as Record<string, unknown> | undefined
  const mediaType = normalized.media_type ?? metadata?.media_type
  const audioUrl = normalized.audio_url ?? metadata?.audio_url
  if (mediaType !== 'podcast' || typeof audioUrl !== 'string' || !audioUrl.trim() || !content.trim()) {
    return false
  }

  const title = String(normalized.title ?? normalized.name ?? '')
  const notes = sanitizeArticle({ title, content })
  return notes.content.length > 0 && !notes.truncated && !notes.criticalPaywall && !notes.codeResidue
}
