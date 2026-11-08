import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { readImageDimensions } from '../_shared/image-dimensions.ts'
import { readProbeBody } from '../_shared/probe-body.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { boundedBatch, workBudget } from '../_shared/work-budget.ts'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const REDIRECTS = new Set([301, 302, 303, 307, 308])

async function fetchImage(url: string, signal: AbortSignal): Promise<Response> {
  let target = assertPublicHttpUrl(url)
  for (let hops = 0; hops < 5; hops++) {
    const response = await fetch(target, {
      redirect: 'manual', signal,
      headers: { 'User-Agent': 'QueerGuide-CountryImageHealth/1.0' },
    })
    const next = response.headers.get('location')
    if (!REDIRECTS.has(response.status) || !next) return response
    await response.body?.cancel().catch(() => {})
    target = assertPublicHttpUrl(new URL(next, target).href)
  }
  throw new Error('Too many image redirects')
}

interface ProbeRow {
  asset_id: string
  entity_id: string
  image_assets: {
    id: string
    url: string
    health_consecutive_failures: number
  } | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const limit = boundedBatch(body.batch_limit, 40, 100)
    const budget = workBudget()
    const { data, error } = await supabase.from('image_asset_links')
      .select('asset_id, entity_id, image_assets!inner(id,url,health_consecutive_failures,health_checked_at,status)')
      .eq('entity_type', 'country').eq('role', 'cover')
      .eq('image_assets.status', 'active')
      .or('health_checked_at.is.null,health_checked_at.lt.' + new Date(Date.now() - 7 * 86400_000).toISOString(), { referencedTable: 'image_assets' })
      .limit(limit)
    if (error) return errorResponse(error.message, 500, req)

    let healthy = 0
    let failed = 0
    for (const row of (data ?? []) as unknown as ProbeRow[]) {
      if (!budget.canStart()) break
      const asset = row.image_assets
      if (!asset) continue
      const checkedAt = new Date().toISOString()
      let status = 0
      let contentType: string | null = null
      let probeError: string | null = null
      let body: Uint8Array | null = null
      try {
        const response = await fetchImage(asset.url, budget.signal(25_000))
        status = response.status
        contentType = response.headers.get('content-type')
        if (response.ok && contentType?.toLowerCase().startsWith('image/')) {
          const declaredBytes = Number(response.headers.get('content-length') ?? 0)
          if (declaredBytes > MAX_IMAGE_BYTES) {
            await response.body?.cancel().catch(() => {})
            throw new Error(`image exceeds 20 MiB probe limit (${declaredBytes} bytes)`)
          }
          body = await readProbeBody(response, MAX_IMAGE_BYTES)
        } else {
          await response.body?.cancel().catch(() => {})
        }
      } catch (cause) {
        probeError = cause instanceof Error ? cause.message : 'probe failed'
      }

      const ok = probeError === null && !!body?.byteLength
      const failures = ok ? 0 : asset.health_consecutive_failures + 1
      const dimensions = body ? readImageDimensions(body) : null
      const contentHash = body ? await sha256(body) : null
      const { error: updateError } = await supabase.from('image_assets').update({
        health_checked_at: checkedAt,
        health_http_status: status || null,
        health_content_type: contentType,
        health_consecutive_failures: failures,
        health_error: ok ? null : (probeError ?? `HTTP ${status || 'unavailable'} / ${contentType ?? 'unknown type'}`),
        bytes: body?.byteLength ?? null,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        format: dimensions?.format ?? null,
        content_hash: contentHash,
      }).eq('id', asset.id)
      if (updateError) throw updateError

      if (ok) {
        healthy++
        continue
      }
      failed++
      if (failures < 2) continue

      const { data: pending } = await supabase.from('ai_suggestions').select('id')
        .eq('entity_type', 'country').eq('entity_id', row.entity_id)
        .eq('suggestion_type', 'image_replacement').eq('status', 'pending').maybeSingle()
      if (!pending) await supabase.from('ai_suggestions').insert({
        suggestion_type: 'image_replacement', entity_type: 'country', entity_id: row.entity_id,
        proposed_value: { action: 'replace_broken_cover', asset_id: asset.id },
        current_value: { url: asset.url, http_status: status || null, content_type: contentType },
        source: 'rule', source_model: 'country-image-health', confidence: 1, status: 'pending',
        review_notes: `Image failed ${failures} consecutive health probes.`,
      })
    }

    return jsonResponse({ success: true, checked: healthy + failed, healthy, failed }, 200, req)
  } catch (cause) {
    return errorResponse(cause instanceof Error ? cause.message : 'country image health failed', 500, req)
  }
})

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value.slice().buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
