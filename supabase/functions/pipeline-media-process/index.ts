import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'

// ============================================================
// Pipeline node: Media Process
// ------------------------------------------------------------
// Reads community_submissions rows with media_processing_status='pending'
// and at least one media URL. Runs CF Workers AI vision over each
// image, populates ocr_text + vision_summary. Video transcripts are
// gated behind ENABLE_VIDEO_TRANSCRIPTS — when off, we mark the row
// 'partial' and rely on the thumbnail/caption text only.
//
// Failure semantics: never fail the row. Partial / failed status is
// stored on community_submissions so the row keeps moving down the DAG.
// ============================================================

const CF_ACCOUNT_ID =
  Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || ''
const CF_AI_TOKEN =
  Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN') || ''
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct'
const ENABLE_VIDEO_TRANSCRIPTS = Deno.env.get('ENABLE_VIDEO_TRANSCRIPTS') === 'true'

const VISION_PROMPT = `You analyse images submitted to queer.guide (LGBTQ+ community platform). Return strict JSON only.

Schema:
{
  "ocr_text": string,                  // every visible piece of text, preserved verbatim
  "summary": string,                   // 2 sentences describing visual content factually
  "looks_like": "event_flyer"|"venue_photo"|"poster"|"screenshot"|"selfie"|"other",
  "languages": [string]                // BCP-47 codes detected in the image
}

Rules:
- JSON only, no commentary
- Do not invent text. If no readable text, return ocr_text=""
- Do not editorialise. Describe what is shown, not what you infer.`

interface VisionResult {
  ocr_text: string
  summary: string
  looks_like: string
  languages: string[]
}

function isImageUrl(u: string): boolean {
  const lower = u.toLowerCase().split('?')[0]
  return /\.(png|jpg|jpeg|webp|gif|bmp)$/.test(lower)
}

function isVideoUrl(u: string): boolean {
  const lower = u.toLowerCase().split('?')[0]
  return /\.(mp4|mov|webm|m4v)$/.test(lower)
}

async function runVision(imageUrl: string): Promise<VisionResult> {
  if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) {
    throw new Error('CF_ACCOUNT_ID + CF_AI_API_TOKEN required')
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${VISION_MODEL}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_AI_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!res.ok) {
    throw new Error(`CF vision ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = await res.json()
  const content = data?.result?.response ?? data?.choices?.[0]?.message?.content ?? ''
  const cleaned = String(content).trim().replace(/^```json\s*|```$/g, '')
  const parsed = JSON.parse(cleaned)
  return {
    ocr_text: String(parsed.ocr_text ?? '').slice(0, 8000),
    summary: String(parsed.summary ?? '').slice(0, 1500),
    looks_like: String(parsed.looks_like ?? 'other'),
    languages: Array.isArray(parsed.languages)
      ? parsed.languages.map(String).slice(0, 5)
      : [],
  }
}

interface RowMedia {
  id: string
  media_urls: string[] | null
  media_storage_paths: string[] | null
  ocr_text: string | null
  vision_summary: string | null
  transcript_text: string | null
}

async function processRow(row: RowMedia, supabase: ReturnType<typeof getServiceClient>) {
  const urls = [...(row.media_urls ?? [])].filter(Boolean)
  if (!urls.length) {
    await supabase
      .from('community_submissions')
      .update({ media_processing_status: 'not_applicable' })
      .eq('id', row.id)
    return { status: 'skipped' as const }
  }

  const ocrChunks: string[] = []
  const summaries: string[] = []
  const errors: Array<{ url: string; error: string }> = []
  let videoSeen = false

  for (const url of urls) {
    if (isVideoUrl(url)) {
      videoSeen = true
      // Video transcripts gated; skip here so we don't fail the row.
      continue
    }
    if (!isImageUrl(url)) continue

    try {
      const r = await withCircuitBreaker(supabase, 'cf-ai-vision', () => runVision(url))
      if (r.ocr_text) ocrChunks.push(r.ocr_text)
      if (r.summary) summaries.push(r.summary)
    } catch (e) {
      if (e instanceof CircuitOpenError) throw e
      errors.push({
        url,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  let status: 'done' | 'partial' | 'failed' = 'done'
  if (errors.length && !ocrChunks.length && !summaries.length) status = 'failed'
  else if (errors.length || (videoSeen && !ENABLE_VIDEO_TRANSCRIPTS)) status = 'partial'

  await supabase
    .from('community_submissions')
    .update({
      ocr_text: ocrChunks.length ? ocrChunks.join('\n\n') : row.ocr_text,
      vision_summary: summaries.length ? summaries.join(' ') : row.vision_summary,
      media_processing_status: status,
      media_processing_errors: errors.length ? errors : null,
    })
    .eq('id', row.id)

  return { status }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const nodeId = body.node_id as string | undefined
    const batchSize = Number(body.batch_size) || 20
    const dryRun = body.dry_run === true

    const { data: rows, error } = await supabase
      .from('community_submissions')
      .select(
        'id, media_urls, media_storage_paths, ocr_text, vision_summary, transcript_text',
      )
      .eq('media_processing_status', 'pending')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true })
      .limit(batchSize)

    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!rows?.length) {
      return jsonResponse(
        { success: true, items: 0, items_processed: 0, message: 'nothing to process' },
        200,
        req,
      )
    }

    let ok = 0
    let failed = 0
    let partial = 0
    let circuitTripped = false

    if (!dryRun) {
      // Mark batch as processing so concurrent runners don't double-grab.
      await supabase
        .from('community_submissions')
        .update({ media_processing_status: 'processing' })
        .in('id', rows.map((r) => r.id))
    }

    for (const row of rows) {
      try {
        const r = await processRow(row, supabase)
        if (r.status === 'done') ok++
        else if (r.status === 'partial') partial++
        else if (r.status === 'failed') failed++
      } catch (e) {
        if (e instanceof CircuitOpenError) {
          circuitTripped = true
          // Restore status so next tick retries.
          await supabase
            .from('community_submissions')
            .update({ media_processing_status: 'pending' })
            .eq('id', row.id)
          await logPipelineError(supabase, 'pipeline-media-process', e, {
            pipeline_run_id: pipelineRunId ?? null,
            severity: 'warn',
            context: { row_id: row.id, node_id: nodeId ?? null },
          })
          break
        }
        failed++
        await supabase
          .from('community_submissions')
          .update({
            media_processing_status: 'failed',
            media_processing_errors: [
              { error: e instanceof Error ? e.message : String(e) },
            ],
          })
          .eq('id', row.id)
        await logPipelineError(supabase, 'pipeline-media-process', e, {
          pipeline_run_id: pipelineRunId ?? null,
          severity: 'error',
          context: { row_id: row.id, node_id: nodeId ?? null },
        })
      }
    }

    return jsonResponse(
      {
        success: true,
        items: rows.length,
        items_total: rows.length,
        items_processed: ok + partial + failed,
        items_succeeded: ok,
        items_partial: partial,
        items_failed: failed,
        circuit_open: circuitTripped,
        dry_run: dryRun,
      },
      200,
      req,
    )
  } catch (err) {
    console.error('pipeline-media-process:', err)
    return errorResponse((err as Error).message, 500, req)
  }
})
