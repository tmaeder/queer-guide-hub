import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { insertSuggestion } from '../_shared/ai-suggestions.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Pipeline node: Image Vision (SEAM — disabled by default)
// ------------------------------------------------------------
// Scores already-mirrored image_assets for aesthetic quality with a vision
// model, behind the cf-ai-image-aesthetic circuit breaker. When a cover/hero
// scores weak it files an ai_suggestions row (image_replacement) for admin
// review — it never mutates the entity, keeping the LLM out of the auto-commit
// path.
//
// Gated behind ENABLE_IMAGE_VISION: when unset/false this is a no-op that
// writes nothing and incurs no model spend. The breaker, the env flag, and the
// suggestion path are all wired; flip the flag (and seed the breaker) to turn
// the phase on. This commit ships the seam only.
// ============================================================

const CF_ACCOUNT_ID =
  Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || ''
const CF_AI_TOKEN =
  Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN') || ''
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct'
const ENABLE_IMAGE_VISION = Deno.env.get('ENABLE_IMAGE_VISION') === 'true'

/** Below this aesthetic score (0..1) a cover/hero is flagged for replacement. */
const WEAK_COVER_THRESHOLD = 0.4

const VISION_PROMPT = `You assess images used on queer.guide (an LGBTQ+ travel guide). Return strict JSON only.

Schema:
{
  "aesthetic_score": number,   // 0..1 — overall photographic quality / how good this looks as a card cover
  "is_usable_cover": boolean,  // false for logos, screenshots, watermarked stock, blurry or low-effort images
  "notes": string              // one short factual sentence
}

Rules:
- JSON only, no commentary.
- Penalise watermarks, logos, screenshots, heavy text overlays, and blur.`

interface VisionScore {
  aesthetic_score: number
  is_usable_cover: boolean
  notes: string
}

interface AssetRow {
  id: string
  url: string
  optimized_url: string | null
  metadata: Record<string, unknown> | null
}

async function scoreImageVision(imageUrl: string): Promise<VisionScore> {
  if (!CF_ACCOUNT_ID || !CF_AI_TOKEN) throw new Error('CF_ACCOUNT_ID + CF_AI_API_TOKEN required')

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${VISION_MODEL}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
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
        max_tokens: 400,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  )
  if (!res.ok) throw new Error(`CF vision ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const content = data?.result?.response ?? data?.choices?.[0]?.message?.content ?? ''
  const cleaned = String(content).trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  const parsed = JSON.parse(cleaned)
  return {
    aesthetic_score: Math.max(0, Math.min(1, Number(parsed.aesthetic_score ?? 0))),
    is_usable_cover: parsed.is_usable_cover !== false,
    notes: String(parsed.notes ?? '').slice(0, 280),
  }
}

Deno.serve(withErrorReporting('pipeline-image-vision', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    if (!ENABLE_IMAGE_VISION) {
      return jsonResponse(
        { success: true, enabled: false, processed: 0, message: 'image vision disabled' },
        200,
        req,
      )
    }

    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(Number(body.batch_size) || 25, 100)

    // Only already-mirrored, unscored, active assets.
    const { data: assets, error } = await supabase
      .from('image_assets')
      .select('id, url, optimized_url, metadata')
      .eq('status', 'active')
      .eq('optimization_status', 'optimized')
      .is('metadata->>image_vision_at', null)
      .limit(batchSize)
    if (error) return errorResponse(`load assets: ${error.message}`, 500, req)
    if (!assets?.length) return jsonResponse({ success: true, enabled: true, processed: 0 }, 200, req)

    let processed = 0
    let flagged = 0
    for (const asset of assets as AssetRow[]) {
      const target = asset.optimized_url ?? asset.url
      let score: VisionScore
      try {
        score = await withCircuitBreaker(supabase, 'cf-ai-image-aesthetic', () => scoreImageVision(target))
      } catch (e) {
        if (e instanceof CircuitOpenError) break // breaker open — leave unscored, retry next run
        console.error(`image-vision ${asset.id}:`, (e as Error).message)
        continue
      }

      await supabase
        .from('image_assets')
        .update({
          metadata: {
            ...(asset.metadata ?? {}),
            aesthetic_score: score.aesthetic_score,
            is_usable_cover: score.is_usable_cover,
            image_vision_at: new Date().toISOString(),
          },
        })
        .eq('id', asset.id)
      processed++

      const weak = !score.is_usable_cover || score.aesthetic_score < WEAK_COVER_THRESHOLD
      if (!weak) continue

      // File a review suggestion for a weak cover/hero — never mutate the entity.
      const { data: link } = await supabase
        .from('image_asset_links')
        .select('entity_type, entity_id, role')
        .eq('asset_id', asset.id)
        .in('role', ['cover', 'hero'])
        .limit(1)
        .maybeSingle()
      if (!link) continue

      try {
        await insertSuggestion(supabase, {
          suggestion_type: 'image_replacement',
          entity_type: link.entity_type,
          entity_id: link.entity_id,
          proposed_value: { asset_id: asset.id, action: 'flag_weak_cover' },
          current_value: { asset_id: asset.id, aesthetic_score: score.aesthetic_score, notes: score.notes },
          source: 'workers-ai',
          source_model: VISION_MODEL,
          confidence: 1 - score.aesthetic_score,
        })
        flagged++
      } catch (e) {
        console.error(`image-vision suggestion ${asset.id}:`, (e as Error).message)
      }
    }

    return jsonResponse({ success: true, enabled: true, processed, flagged }, 200, req)
  } catch (error) {
    console.error('pipeline-image-vision error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
