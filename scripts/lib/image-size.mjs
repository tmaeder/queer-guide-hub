/**
 * Pixel dimensions from an image's header bytes.
 *
 * Every question about image quality on this platform is a question about
 * pixels, and the two cheap-looking answers are both wrong: the database does
 * not know (`image_assets.width` is null on 80,860 of the rows carrying an
 * `optimized_url`), and the URL lies — a Shopify `?width=32` is a RESIZE
 * REQUEST, not a description, and cherrykitten's "32px" icon is a 256×256 PNG.
 * Ask the bytes.
 *
 * Header-only and format-specific on purpose. Decoding a 2500px JPEG to learn
 * that it is 2500px wide costs the whole file; every format below carries the
 * size within its first few hundred bytes, so callers can pass the result of a
 * `Range: bytes=0-65535` request and skip ~99% of the download. A host that
 * ignores Range simply sends more bytes; the parsers stop at the same place.
 *
 * Returns null when the bytes are not a recognisable image header — which
 * includes the case where a truncated read landed mid-file. Callers must treat
 * null as "unknown", never as "zero pixels".
 */

function pngSize(b) {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), fmt: 'png' }
}

function gifSize(b) {
  if (b.length < 10 || b.toString('ascii', 0, 3) !== 'GIF') return null
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8), fmt: 'gif' }
}

function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]
    // SOF0..SOF15 carry the frame dimensions — except C4 (Huffman table),
    // C8 (JPEG extensions) and CC (arithmetic coding conditioning), which
    // share the range but are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), fmt: 'jpeg' }
    }
    // Standalone markers carry no length field to skip over.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const len = b.readUInt16BE(i + 2)
    if (len < 2) return null
    i += 2 + len
  }
  return null
}

function webpSize(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null
  const kind = b.toString('ascii', 12, 16)
  // Extended format stores width-1 / height-1 as 24-bit little-endian.
  if (kind === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1, fmt: 'webp' }
  // Lossy: 14-bit fields after the 3-byte start code + 2-byte signature.
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, fmt: 'webp' }
  // Lossless: 14 bits each, packed from bit 0 of a 32-bit little-endian word.
  if (kind === 'VP8L') {
    const n = b.readUInt32LE(21)
    return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1, fmt: 'webp' }
  }
  return null
}

/**
 * AVIF/HEIF. The size lives in the `ispe` box; this scans for the box tag
 * rather than walking the ISOBMFF tree, which is enough for the single-item
 * files a CDN serves and far less code than a real parser. A file with
 * multiple `ispe` boxes (thumbnail + primary) yields the first, so treat AVIF
 * dimensions as approximate and never as the sole basis for discarding an
 * asset.
 */
function avifSize(b) {
  if (b.length < 32 || b.toString('ascii', 4, 8) !== 'ftyp') return null
  const idx = b.indexOf('ispe', 0, 'ascii')
  if (idx < 0 || idx + 16 > b.length) return null
  return { w: b.readUInt32BE(idx + 8), h: b.readUInt32BE(idx + 12), fmt: 'avif' }
}

export function imageSize(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  const size = pngSize(b) || jpegSize(b) || webpSize(b) || gifSize(b) || avifSize(b)
  if (!size || !size.w || !size.h) return null
  return size
}
