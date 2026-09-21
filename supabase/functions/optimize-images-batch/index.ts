import { getCorsHeaders, getServiceClient, requireAdmin, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import { readImageDimensions } from '../_shared/image-dimensions.ts'

const BATCH_SIZE = 15
const FETCH_TIMEOUT_MS = 8000
const BUCKET = 'optimized-images'

const CDN_PATTERNS = [
  'res.cloudinary.com', 'upload.wikimedia.org', 'images.pexels.com',
  'images.unsplash.com', 'fastly.4sqi.net', 'i0.wp.com',
  'googleusercontent.com', 'fbcdn.net', '.cloudfront.net',
  'akamaized.net', 'imgix', 's.yimg.com', 'bloximages.',
  'pyxis.nymag.com', 'supabase',
]

function isOnCdn(url: string): boolean {
  const lower = url.toLowerCase()
  return CDN_PATTERNS.some(p => lower.includes(p)) ||
    lower.includes('cdn.') || lower.includes('static.') ||
    lower.includes('media.') || lower.includes('assets.') ||
    lower.includes('img.') || lower.includes('images.')
}

function extFromContentType(ct: string): string {
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('avif')) return 'avif'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('svg')) return 'svg'
  return 'jpg'
}

function formatFromContentType(ct: string): 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'svg' | 'other' {
  const ext = extFromContentType(ct)
  if (ext === 'jpg') return 'jpeg'
  if (['png', 'webp', 'avif', 'gif', 'svg'].includes(ext)) return ext as 'png' | 'webp' | 'avif' | 'gif' | 'svg'
  return 'other'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const batchSize = Math.min(body.batch_size || BATCH_SIZE, 50)
    const mode = body.mode || 'auto' // 'auto' | 'mirror' | 'mark_cdn'
    const entityType = body.entity_type || null

    // Fetch pending images
    const { data: pending, error: fetchErr } = entityType === 'marketplace_listing'
      ? await supabase.rpc('marketplace_claim_image_assets', { p_limit: batchSize })
      : await supabase
        .from('image_assets')
        .select('id, url, format, metadata')
        .eq('status', 'active')
        .eq('optimization_status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batchSize)

    if (fetchErr) return errorResponse(`Query failed: ${fetchErr.message}`, 500, req)
    if (!pending || pending.length === 0) {
      return jsonResponse({ done: true, processed: 0, remaining: 0, message: 'All images optimized' }, 200, req)
    }

    // Get remaining count
    const { count: remaining } = await supabase
      .from('image_assets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('optimization_status', 'pending')

    let mirrored = 0
    let cdnMarked = 0
    let failed = 0

    for (const row of pending) {
      const url = row.url as string
      const id = row.id as string

      const existingMetadata = (row.metadata ?? {}) as Record<string, unknown>
      const markFailed = async (reason: string) => {
        const attempts = Number(existingMetadata.optimization_attempts ?? 0) + 1
        await supabase.from('image_assets').update({
          optimization_status: 'failed',
          metadata: {
            ...existingMetadata,
            optimization_attempts: attempts,
            last_failure_reason: reason,
            failure_class: reason.replace(/_.*/, ''),
            terminal: attempts >= 3,
            last_failed_at: new Date().toISOString(),
          },
        }).eq('id', id)
      }

      // Download even CDN-hosted assets so width/height/bytes are factual.
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        const imgRes = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'QueerGuide-ImageOptimizer/1.0' },
        })
        clearTimeout(timeout)

        if (!imgRes.ok) {
          await markFailed(`http_${imgRes.status}`)
          failed++
          continue
        }

        const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
        const buffer = await imgRes.arrayBuffer()
        const bytes = new Uint8Array(buffer)

        if (buffer.byteLength < 100) {
          await markFailed('invalid_too_small')
          failed++
          continue
        }

        const dimensions = readImageDimensions(bytes)
        if (mode !== 'mirror' && isOnCdn(url)) {
          await supabase.from('image_assets').update({
            optimization_status: 'cdn_optimized',
            optimized_at: new Date().toISOString(),
            bytes: buffer.byteLength,
            width: dimensions?.width ?? null,
            height: dimensions?.height ?? null,
            format: dimensions?.format ?? formatFromContentType(contentType),
            metadata: { ...existingMetadata, optimization_attempts: Number(existingMetadata.optimization_attempts ?? 0) + 1 },
          }).eq('id', id)
          cdnMarked++
          continue
        }

        const ext = extFromContentType(contentType)
        const filePath = `${id}.${ext}`

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, buffer, {
            contentType,
            cacheControl: '31536000',
            upsert: true,
          })

        if (uploadErr) {
          console.error(`Upload failed for ${id}:`, uploadErr.message)
          await markFailed('upload_failed')
          failed++
          continue
        }

        const { data: pubUrl } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path)

        await supabase
          .from('image_assets')
          .update({
            optimization_status: 'optimized',
            optimized_url: pubUrl.publicUrl,
            optimized_at: new Date().toISOString(),
            bytes: buffer.byteLength,
            width: dimensions?.width ?? null,
            height: dimensions?.height ?? null,
            format: dimensions?.format ?? formatFromContentType(contentType),
            metadata: { ...existingMetadata, optimization_attempts: Number(existingMetadata.optimization_attempts ?? 0) + 1 },
          })
          .eq('id', id)

        mirrored++
      } catch (err) {
        console.error(`Mirror failed for ${id}:`, (err as Error).message)
        await markFailed(err instanceof DOMException && err.name === 'AbortError' ? 'timeout' : 'fetch_error')
        failed++
      }
    }

    return jsonResponse({
      done: false,
      processed: pending.length,
      mirrored,
      cdn_marked: cdnMarked,
      failed,
      remaining: (remaining ?? 0) - pending.length,
      entity_type: entityType,
    }, 200, req)

  } catch (error) {
    console.error('optimize-images-batch error:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
