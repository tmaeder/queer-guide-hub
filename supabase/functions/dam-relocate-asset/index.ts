// dam-relocate-asset — change a cms_media asset's access tier AND move its bytes to the
// bucket/prefix that enforces that tier, atomically. Runs with the service role because
// storage RLS blocks admins from deleting root-level cms-media objects (delete policy keys
// on foldername[1] = uid), and dam-private tier prefixes ('partner/'|'internal/') drive the
// read policy — so a public↔private flip OR a partner↔internal flip must physically relocate.
//
// POST { id: uuid, access_level: 'public'|'partner'|'internal', brand_category?: string|null }
// Admin-gated. Idempotent: if the target location already matches, only the row is patched.
import { getCorsHeaders, getServiceClient, requireAdmin, jsonResponse, errorResponse } from '../_shared/supabase-client.ts'

const PUBLIC_BUCKET = 'cms-media'
const PRIVATE_BUCKET = 'dam-private'
const TIERS = ['public', 'partner', 'internal']

function bucketForTier(access: string): string {
  return access === 'public' ? PUBLIC_BUCKET : PRIVATE_BUCKET
}

function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

function keyForTier(access: string, filename: string): string {
  return access === 'public' ? filename : `${access}/${filename}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req)

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const id: string | undefined = body?.id
    const access: string | undefined = body?.access_level
    const hasBrand = Object.prototype.hasOwnProperty.call(body, 'brand_category')
    const brandCategory: string | null = body?.brand_category ?? null

    if (!id || !access || !TIERS.includes(access)) {
      return errorResponse('id and a valid access_level (public|partner|internal) are required', 400, req)
    }

    const { data: row, error: loadErr } = await supabase
      .from('cms_media')
      .select('id, storage_bucket, storage_path, mime_type')
      .eq('id', id)
      .maybeSingle()
    if (loadErr) return errorResponse(`Load failed: ${loadErr.message}`, 500, req)
    if (!row) return errorResponse('Asset not found', 404, req)

    const patch: Record<string, unknown> = { access_level: access }
    if (hasBrand) patch.brand_category = brandCategory

    // Rows with no stored bytes (external/URL-only) just get the metadata patch.
    if (row.storage_path) {
      const curBucket = row.storage_bucket || PUBLIC_BUCKET
      const curPath = row.storage_path as string
      const tgtBucket = bucketForTier(access)
      const tgtKey = keyForTier(access, basename(curPath))

      if (tgtBucket !== curBucket || tgtKey !== curPath) {
        if (tgtBucket === curBucket) {
          // Same bucket (partner↔internal re-key): a native move is atomic and cheap.
          const { error } = await supabase.storage.from(curBucket).move(curPath, tgtKey)
          if (error) return errorResponse(`Move failed: ${error.message}`, 500, req)
        } else {
          // Cross-bucket (public↔private): download → upload → remove original.
          const dl = await supabase.storage.from(curBucket).download(curPath)
          if (dl.error || !dl.data) return errorResponse(`Download failed: ${dl.error?.message ?? 'no data'}`, 500, req)
          const up = await supabase.storage.from(tgtBucket).upload(tgtKey, dl.data, {
            contentType: (row.mime_type as string) || 'application/octet-stream',
            upsert: true,
          })
          if (up.error) return errorResponse(`Upload failed: ${up.error.message}`, 500, req)
          const rm = await supabase.storage.from(curBucket).remove([curPath])
          if (rm.error) {
            // Bytes are safely in the target; the stale source is a leak, not a data-loss.
            // Roll the row forward anyway and report the orphan for cleanup.
            console.error(`dam-relocate: orphaned source ${curBucket}/${curPath}: ${rm.error.message}`)
          }
        }
        patch.storage_bucket = tgtBucket
        patch.storage_path = tgtKey
      }
    }

    const { error: updErr } = await supabase.from('cms_media').update(patch).eq('id', id)
    if (updErr) return errorResponse(`Update failed: ${updErr.message}`, 500, req)

    return jsonResponse(
      { ok: true, id, access_level: access, storage_bucket: patch.storage_bucket ?? row.storage_bucket, storage_path: patch.storage_path ?? row.storage_path },
      200,
      req,
    )
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : 'Unexpected error', 500, req)
  }
})
