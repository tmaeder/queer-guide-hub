/**
 * image_assets helper — Wave B.1 of the Search Intelligence rollup.
 *
 * Mirror jobs (fetch-venue-images, fetch-personality-images, etc.) call
 * upsertImageAsset() after a successful entity update so the image_assets
 * registry (#169) gets populated alongside the existing per-entity columns.
 *
 * Dual-write strategy: existing readers continue to read entity.images[]
 * / entity.image_url. The image_assets row is the new canonical record;
 * a future PR will switch readers to it.
 *
 * Pure best-effort: any failure here logs + returns false. The caller's
 * primary entity-row update is unaffected.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

export interface UpsertImageAssetInput {
  url: string
  source?: 'scraper' | 'user_submission' | 'ai_generated' | 'partner' | 'admin_upload'
  source_ref?: string | null
  license?: string | null
  attribution?: string | null
  alt_text?: string | null
  alt_provenance?: 'human' | 'ai-generated' | 'imported' | 'none' | null
  entity_type: string
  entity_id: string
  role?: 'cover' | 'gallery' | 'thumbnail' | 'social' | 'og' | 'square' | 'hero'
  sort_order?: number
}

export async function upsertImageAsset(
  supabase: SupabaseClient,
  input: UpsertImageAssetInput,
): Promise<boolean> {
  try {
    const canonicalUrl = canonicaliseUrl(input.url)
    if (!canonicalUrl) return false
    const urlHash = await sha256Hex(canonicalUrl)

    // 1. UPSERT image_assets keyed on url_hash. last_seen_at always advances.
    const { data: asset, error: assetErr } = await supabase
      .from('image_assets')
      .upsert(
        {
          url_hash: urlHash,
          url: canonicalUrl,
          source: input.source ?? 'scraper',
          source_ref: input.source_ref ?? null,
          license: input.license ?? null,
          attribution: input.attribution ?? null,
          alt_text: input.alt_text ?? null,
          alt_provenance: input.alt_provenance ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'url_hash' },
      )
      .select('id')
      .single()
    if (assetErr || !asset) {
      console.warn('upsertImageAsset: asset upsert failed', assetErr?.message)
      return false
    }

    // 2. UPSERT the link. PK is (asset_id, entity_type, entity_id, role).
    const { error: linkErr } = await supabase
      .from('image_asset_links')
      .upsert(
        {
          asset_id: asset.id,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          role: input.role ?? 'gallery',
          sort_order: input.sort_order ?? 0,
        },
        { onConflict: 'asset_id,entity_type,entity_id,role' },
      )
    if (linkErr) {
      console.warn('upsertImageAsset: link upsert failed', linkErr.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('upsertImageAsset: unexpected', err)
    return false
  }
}

/**
 * Canonicalise an image URL for hashing: lowercase host, strip query string,
 * remove trailing slash. Returns null on parse failure.
 */
export function canonicaliseUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    u.hash = ''
    u.search = ''
    u.hostname = u.hostname.toLowerCase()
    let s = u.toString()
    // URL().toString() always appends a trailing slash for hostname-only URLs;
    // for path URLs we strip it for stability.
    if (u.pathname !== '/' && s.endsWith('/')) s = s.slice(0, -1)
    return s
  } catch {
    return null
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
