/**
 * How much *dark ink* a PNG actually contains.
 *
 * The brand-logo plate is paper in both themes (see `--color-logo-plate`), and
 * a merchant who ships only a white-on-transparent wordmark therefore renders
 * as an empty square. Measured over the 80 logos this catalogue mirrored: **7
 * contain no dark pixel at all** — Automic Gold, Good Boy Underwear, Nattaup,
 * Provocateur, SUPAWEAR among them. Those need an ink plate instead.
 *
 * **The file name is not evidence.** SUPAWEAR's asset is `…-logo-white.png`,
 * which a regex catches, but Automic Gold's is `Automic_GOLD_logo-_left_align`
 * and is equally invisible. Polarity has to be read off the pixels.
 *
 * **And no CSS treatment substitutes for reading them.** All three were built
 * and looked at side by side: a blurred edge barely rescues a white mark, a
 * hard 1px outline rescues it but fattens every thin dark wordmark into a
 * smear (Vilain Garçon, gc2b), and an ink plate is perfect for white marks and
 * erases every dark one. There is no polarity-agnostic treatment; there is only
 * knowing which polarity you have.
 *
 * PNG only, and that is not a gap: the failure needs transparency, JPEG cannot
 * be transparent, and the handful of SVGs carry explicit fills. A format or
 * variant this cannot read returns null, and the caller leaves the row on the
 * default paper plate — an unmeasured logo is never moved onto ink on a guess.
 */

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Channels per pixel for each PNG colour type; -1 marks the undefined slots. */
const CHANNELS = [1, -1, 3, 1, 2, -1, 4];

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Undo the per-scanline filter, in place, over the raw inflated bytes. */
function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array | null {
  const stride = width * bpp;
  if (raw.byteLength < height * (stride + 1)) return null;
  const out = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const type = raw[src++];
    const row = y * stride;
    const prev = row - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? out[row + i - bpp] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = y > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let v: number;
      switch (type) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          return null; // not a PNG filter type — refuse rather than guess
      }
      out[row + i] = v & 0xff;
    }
    src += stride;
  }
  return out;
}

export interface PngInk {
  /** Share of visible pixels that are dark enough to read on paper. */
  darkFraction: number;
  /** Visible (non-near-transparent) pixels sampled. */
  opaque: number;
}

/**
 * Fraction of a PNG's visible pixels that are dark, or null when the file
 * cannot be read (not a PNG, 16-bit, interlaced, truncated).
 */
export async function pngInk(bytes: Uint8Array): Promise<PngInk | null> {
  if (bytes.byteLength < 33 || SIG.some((b, i) => bytes[i] !== b)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let width = 0;
  let height = 0;
  let colorType = -1;
  let palette: Uint8Array | null = null;
  let paletteAlpha: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  let at = 8;
  while (at + 8 <= bytes.byteLength) {
    const len = dv.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const body = at + 8;
    if (body + len > bytes.byteLength) return null;
    if (type === 'IHDR') {
      width = dv.getUint32(body);
      height = dv.getUint32(body + 4);
      const bitDepth = bytes[body + 8];
      colorType = bytes[body + 9];
      const interlace = bytes[body + 12];
      // 8-bit progressive only. Adam7 and 16-bit are rare enough on shop logos
      // that decoding them would be untested code paths carrying real risk.
      if (bitDepth !== 8 || interlace !== 0) return null;
      if (CHANNELS[colorType] === undefined || CHANNELS[colorType] < 0) return null;
      if (width <= 0 || height <= 0 || width * height > 8_000_000) return null;
    } else if (type === 'PLTE') {
      palette = bytes.subarray(body, body + len);
    } else if (type === 'tRNS') {
      if (colorType === 3) paletteAlpha = bytes.subarray(body, body + len);
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(body, body + len));
    } else if (type === 'IEND') {
      break;
    }
    at = body + len + 4;
  }
  if (colorType < 0 || idat.length === 0) return null;
  if (colorType === 3 && !palette) return null;

  const packed = new Uint8Array(idat.reduce((n, c) => n + c.byteLength, 0));
  let off = 0;
  for (const c of idat) {
    packed.set(c, off);
    off += c.byteLength;
  }

  let pixels: Uint8Array | null;
  try {
    pixels = unfilter(await inflate(packed), width, height, CHANNELS[colorType]);
  } catch {
    return null;
  }
  if (!pixels) return null;

  const ch = CHANNELS[colorType];
  const stride = width * ch;
  // Cap the work: a 2000px logo has 4M pixels and every one would tell the same
  // story. Sampling on a grid keeps this a few thousand reads whatever arrives.
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 20_000)));

  let opaque = 0;
  let dark = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = y * stride + x * ch;
      let r: number, g: number, b: number, a: number;
      if (colorType === 6) {
        r = pixels[i];
        g = pixels[i + 1];
        b = pixels[i + 2];
        a = pixels[i + 3];
      } else if (colorType === 2) {
        r = pixels[i];
        g = pixels[i + 1];
        b = pixels[i + 2];
        a = 255;
      } else if (colorType === 0) {
        r = g = b = pixels[i];
        a = 255;
      } else if (colorType === 4) {
        r = g = b = pixels[i];
        a = pixels[i + 1];
      } else {
        const idx = pixels[i];
        const p = idx * 3;
        if (!palette || p + 2 >= palette.byteLength) return null;
        r = palette[p];
        g = palette[p + 1];
        b = palette[p + 2];
        a = paletteAlpha && idx < paletteAlpha.byteLength ? paletteAlpha[idx] : 255;
      }
      if (a < 40) continue;
      opaque++;
      if ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.6) dark++;
    }
  }
  if (opaque === 0) return null;
  return { darkFraction: dark / opaque, opaque };
}

/**
 * True when a logo would be invisible on the paper plate and belongs on ink.
 *
 * The 2% floor is not a round number: measured across the catalogue the
 * distribution is bimodal with nothing between 0.000 and 0.027, so anything in
 * that gap separates the seven all-white marks from everything else. 0.027 is
 * Origami Customs, a gold award badge that reads perfectly well on paper.
 */
export function needsInkPlate(ink: PngInk | null): boolean {
  return ink !== null && ink.darkFraction < 0.02;
}
