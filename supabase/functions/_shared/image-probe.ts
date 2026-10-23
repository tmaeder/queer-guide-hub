/**
 * Role-aware image gate built on the lightweight {@link probeImage} network
 * probe. A cover/hero is high-visibility, so it must be large, landscape-ish,
 * and not a near-solid-colour placeholder; gallery/thumbnail images keep the
 * permissive base thresholds.
 *
 * `evaluateCover` is pure and works off already-known dimensions/bytes (e.g. the
 * width/height a stock API already returned), so the venue/event accept path can
 * enforce cover quality without a second network round-trip. `probeForRole`
 * fetches when the caller only has a URL.
 */

import { probeImage, type ImageProbe } from './news-quality/image-check.ts'

export type ProbeRole = 'cover' | 'hero' | 'event_artwork' | 'gallery' | 'thumbnail'

const COVER_MIN_W = 800
const COVER_MIN_H = 450
const HERO_MIN_RATIO = 1.3
const COVER_MIN_BYTES = 20_000
/** Bytes-per-pixel below this ⇒ near-flat (solid colour / gradient placeholder). */
const MIN_BPP = 0.05

export interface CoverInput {
  width?: number
  height?: number
  bytes?: number
}

/** Returns a fail reason for cover/hero/event artwork, or null if it passes.
 * Unknown dimensions are not penalised (the caller may not have decoded yet). */
export function evaluateCover(input: CoverInput, role: ProbeRole): string | null {
  if (role !== 'cover' && role !== 'hero' && role !== 'event_artwork') return null
  const { width, height, bytes } = input

  if (width && height) {
    // Event posters can be portrait. Keep the same minimum short/long edges,
    // bytes and pixel density; orientation alone does not make artwork blurry.
    const tooSmall = role === 'event_artwork'
      ? Math.min(width, height) < COVER_MIN_H || Math.max(width, height) < COVER_MIN_W
      : width < COVER_MIN_W || height < COVER_MIN_H
    if (tooSmall) return 'cover_too_small'
    if (role === 'hero' && width / height < HERO_MIN_RATIO) return 'cover_portrait'
    if (bytes && bytes / (width * height) < MIN_BPP) return 'near_solid_color'
  }
  if (bytes && bytes < COVER_MIN_BYTES) return 'cover_low_bytes'
  return null
}

export interface RoleProbe extends ImageProbe {
  passed: boolean
  failReason?: string
}

/** Probe a URL and apply role-aware acceptance. */
export async function probeForRole(url: string, role: ProbeRole, signal?: AbortSignal): Promise<RoleProbe> {
  const p = await probeImage(url, signal)
  if (!p.ok) return { ...p, passed: false, failReason: p.reason }
  const reason = evaluateCover({ width: p.width, height: p.height, bytes: p.bytes }, role)
  return { ...p, passed: !reason, failReason: reason ?? undefined }
}
