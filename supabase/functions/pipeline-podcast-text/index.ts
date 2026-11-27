import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { podcastSourceNotes, podcastText } from '../_shared/podcast-text.ts'
import { podcastTranscriptLinks } from '../_shared/podcast-transcripts.ts'
import { checkTranscriptBatch } from '../_shared/podcast-transcript-check.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

Deno.serve(withErrorReporting('pipeline-podcast-text', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('POST required', 405, req)
  const db = getServiceClient()
  const auth = await requireInternalOrAdmin(req, db)
  if (auth instanceof Response) return auth
  const body = await req.json().catch(() => ({}))
  const size = Number(body.batch_size ?? 100)
  if (!Number.isInteger(size) || size < 1 || size > 200) {
    return errorResponse('batch_size must be an integer from 1 to 200', 400, req)
  }
  const { data, error } = await db.rpc('news_podcast_text_pending', { p_limit: size })
  if (error) throw new Error(`load podcast text: ${error.message}`)
  const items = (data ?? []).map((row: { id: string; content: string | null; raw_notes: string | null; source_hash: string; ai_summary: string | null }) => {
    // Normalization flattened paragraphs in older imports. Recover them only
    // when the source words still match; never replace a later editorial edit.
    const source = podcastSourceNotes(row.content ?? '', row.raw_notes)
    return { id: row.id, source_hash: row.source_hash, ...podcastText(source, row.ai_summary) }
  })
  const { data: pendingTranscripts, error: transcriptError } = await db.rpc('news_podcast_transcripts_pending', { p_limit: size })
  if (transcriptError) throw new Error('load podcast transcripts: ' + transcriptError.message)
  const transcripts = (pendingTranscripts ?? []).map((row: { id: string; url: string; content: string; raw_notes: string; declared: unknown; source_hash: string; audio_url: string | null }) => ({
    id: row.id,
    source_hash: row.source_hash,
    links: podcastTranscriptLinks(row.content, podcastTranscriptLinks(row.raw_notes, row.declared, row.url, row.audio_url ?? undefined), row.url, row.audio_url ?? undefined),
  }))
  if (body.dry_run === true) return jsonResponse({ success: true, items: items.length, previews: items.slice(0, 5), transcript_previews: transcripts.slice(0, 5) }, 200, req)
  const checkedTranscripts = await checkTranscriptBatch(transcripts)
  let updated = 0
  if (items.length) {
    const result = await db.rpc('news_podcast_text_apply', { p_items: items })
    if (result.error) throw new Error('save podcast text: ' + result.error.message)
    updated = result.data ?? 0
  }
  let transcriptsUpdated = 0
  if (checkedTranscripts.items.length) {
    const result = await db.rpc('news_podcast_transcripts_apply', { p_items: checkedTranscripts.items })
    if (result.error) throw new Error('save podcast transcripts: ' + result.error.message)
    transcriptsUpdated = result.data ?? 0
  }
  return jsonResponse({ success: true, selected: items.length, updated, transcripts_selected: checkedTranscripts.items.length, transcripts_updated: transcriptsUpdated, transcripts_rejected: checkedTranscripts.rejected, transcripts_deferred: checkedTranscripts.deferred }, 200, req)
}))
