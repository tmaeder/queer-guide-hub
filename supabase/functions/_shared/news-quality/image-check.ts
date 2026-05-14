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
