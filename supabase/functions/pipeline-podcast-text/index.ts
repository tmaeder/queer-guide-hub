import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { podcastSourceNotes, podcastText } from '../_shared/podcast-text.ts'
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
  if (body.dry_run === true) return jsonResponse({ success: true, items: items.length, previews: items.slice(0, 5) }, 200, req)
  if (!items.length) return jsonResponse({ success: true, selected: 0, updated: 0 }, 200, req)
  const { data: updated, error: updateError } = await db.rpc('news_podcast_text_apply', { p_items: items })
  if (updateError) throw new Error(`save podcast text: ${updateError.message}`)
  return jsonResponse({ success: true, selected: items.length, updated }, 200, req)
}))
