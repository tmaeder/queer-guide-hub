// Lightweight image quality probe.
// HEAD-fetches the URL, parses content-type / content-length, optionally
// pulls the first few KB to read PNG/JPEG/GIF/WEBP intrinsic dimensions.
// Pure network — no AI, no DB. Pipeline-quality-enhance feeds the result to the LLM
// for a final usability call.

export interface ImageProbe {
  url: string
  ok: boolean
  status?: number
  contentType?: string
  bytes?: number
  width?: number
  height?: number
  reason?: string
}

const MIN_BYTES = 4_000 // < 4KB is almost certainly a tracking pixel or 1x1 placeholder
const MIN_DIM = 200

/**
 * Resolve the image a staged news row already carries.
 *
 * MIRRORS news_commit_staging_batch, which resolves the published image as
 *
 *   coalesce(enriched.image_url, normalized.image_url,
 *            normalized.images[0], metadata.image_url)
 *
 * and is correct. The caller was reading `normalized.image_url` alone — a field
 * pipeline-normalize only ever sets on the PERSONALITY branch, never for news,
 * where it writes `images[]` and the source adapter writes `metadata.image_url`.
 *
 * Measured on prod 2026-09-13 over 30 days: top-level image_url is present on
 * 0 of 3,107 podcast rows and 511 of 10,023 articles, while an image is
 * reachable via images[0]/metadata on 5,118 rows the old read missed entirely.
 * The probe therefore reported `no_image`, the Pexels replacement fired, and the
 * stock URL was written to enriched.image_url — which the commit RPC prefers
 * over the real artwork it would otherwise have found. A queer audio drama was
 * published with a stock photo of a concrete cross.
 *
 * `enriched.image_url` is deliberately NOT an input: it is the replacement this
 * pipeline is about to decide on, so feeding it back in would make a previous
 * run's stock photo suppress the real image forever.
 *
 * Keep the order in step with the RPC — the two must agree, or the image we
 * probe and judge is not the image that gets published.
 */
export function resolveStagedImageUrl(
  normalized: Record<string, unknown> | null | undefined,
): string | undefined {
  const n = normalized ?? {}
  const meta = (n.metadata ?? {}) as Record<string, unknown>
  const images = Array.isArray(n.images) ? n.images : []

  const candidates: unknown[] = [
    n.image_url,
    n.imageUrl,
    images[0],
    meta.image_url,
  ]

  for (const c of candidates) {
    if (typeof c !== 'string') continue
    const url = c.trim()
    // Scheme-checked for the same reason pipeline-normalize checks it: a relative
    // path or a `data:` blob is not something probeImage can HEAD.
    if (/^https?:\/\//i.test(url)) return url
  }
  return undefined
}

async function readDimensions(buf: Uint8Array, mime: string): Promise<{ w: number; h: number } | null> {
  try {
    if (mime.includes('png') && buf.length >= 24) {
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
      // PNG IHDR: width @ offset 16, height @ offset 20 (big-endian uint32)
      return { w: view.getUint32(16), h: view.getUint32(20) }
    }
    if ((mime.includes('jpeg') || mime.includes('jpg')) && buf.length > 4) {
      // Walk JPEG markers to SOF
      let i = 2
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null
        const marker = buf[i + 1]
        const segLen = (buf[i + 2] << 8) | buf[i + 3]
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { h: (buf[i + 5] << 8) | buf[i + 6], w: (buf[i + 7] << 8) | buf[i + 8] }
        }
        i += 2 + segLen
      }
    }
    if (mime.includes('gif') && buf.length >= 10) {
      return { w: buf[6] | (buf[7] << 8), h: buf[8] | (buf[9] << 8) }
    }
    if (mime.includes('webp') && buf.length >= 30) {
      // VP8X / VP8 / VP8L variants — handle VP8X (most common modern WebP)
      if (String.fromCharCode(...buf.slice(12, 16)) === 'VP8X') {
        const w = 1 + ((buf[24] | (buf[25] << 8) | (buf[26] << 16)) & 0xffffff)
        const h = 1 + ((buf[27] | (buf[28] << 8) | (buf[29] << 16)) & 0xffffff)
        return { w, h }
      }
    }
  } catch {
    /* fall through */
  }
  return null
}

export async function probeImage(url: string, signal?: AbortSignal): Promise<ImageProbe> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { url, ok: false, reason: 'invalid_url' }
  }

  try {
    const head = await fetch(url, { method: 'HEAD', signal, redirect: 'follow' })
    const contentType = (head.headers.get('content-type') ?? '').toLowerCase()
    const lengthHdr = head.headers.get('content-length')
    const bytes = lengthHdr ? Number(lengthHdr) : undefined

    if (!head.ok) return { url, ok: false, status: head.status, contentType, bytes, reason: `http_${head.status}` }
    if (!contentType.startsWith('image/')) return { url, ok: false, status: head.status, contentType, bytes, reason: 'not_image' }
    if (bytes !== undefined && bytes > 0 && bytes < MIN_BYTES) {
      return { url, ok: false, status: head.status, contentType, bytes, reason: 'too_small_bytes' }
    }

    // Read first 32KB to extract dimensions for the common formats.
    const probe = await fetch(url, {
      method: 'GET',
      signal,
      headers: { Range: 'bytes=0-32767' },
      redirect: 'follow',
    })
    const buf = new Uint8Array(await probe.arrayBuffer())
    const dims = await readDimensions(buf, contentType)
    const reason =
      dims && (dims.w < MIN_DIM || dims.h < MIN_DIM) ? 'low_resolution' : undefined

    return {
      url,
      ok: !reason,
      status: head.status,
      contentType,
      bytes: bytes ?? buf.length,
      width: dims?.w,
      height: dims?.h,
      reason,
    }
  } catch (err) {
    return { url, ok: false, reason: `fetch_error:${(err as Error).message.slice(0, 80)}` }
  }
}
