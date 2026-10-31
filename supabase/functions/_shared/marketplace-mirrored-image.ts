import { readImageDimensions } from './image-dimensions.ts'

/** Metadata for the exact, unchanged bytes successfully uploaded to our CDN. */
export function mirroredImageMetadata(bytes: Uint8Array, mirroredUrl: string) {
  const dimensions = readImageDimensions(bytes)
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return null
  return {
    ...dimensions,
    bytes: bytes.byteLength,
    optimized_url: mirroredUrl,
    optimization_status: 'cdn_optimized' as const,
  }
}

export type MirroredImageMetadata = NonNullable<ReturnType<typeof mirroredImageMetadata>>

export interface SourceImageAsset {
  status: string
  is_flagged: boolean
  access_level: string
  health_consecutive_failures: number | null
  brand_category: string | null
}

/** A new CDN URL must not reset restrictions already attached to its source. */
export function sourceImageMayBeMirrored(asset: SourceImageAsset): boolean {
  return asset.status === 'active' && !asset.is_flagged && asset.access_level === 'public'
    && (asset.health_consecutive_failures ?? 0) < 2
    && !['logo', 'color', 'typography', 'iconography', 'template', 'guideline'].includes(asset.brand_category ?? 'photography')
}
