export interface ImageDimensions {
  width: number
  height: number
  format: 'jpeg' | 'png' | 'gif' | 'webp'
}

const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.slice(i, i + n))

/** Reads dimensions without decoding pixels; returns null for unsupported/corrupt data. */
export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') {
    return { width: u32be(bytes, 16), height: u32be(bytes, 20), format: 'png' }
  }
  if (bytes.length >= 10 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
    return { width: u16le(bytes, 6), height: u16le(bytes, 8), format: 'gif' }
  }
  if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const kind = ascii(bytes, 12, 4)
    if (kind === 'VP8X') return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1, format: 'webp' }
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff, format: 'webp' }
    }
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
        format: 'webp',
      }
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue }
      const marker = bytes[i + 1]
      if (marker === 0xd8 || marker === 0xd9) { i += 2; continue }
      const length = u16be(bytes, i + 2)
      if (length < 2 || i + 2 + length > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: u16be(bytes, i + 7), height: u16be(bytes, i + 5), format: 'jpeg' }
      }
      i += 2 + length
    }
  }
  return null
}
