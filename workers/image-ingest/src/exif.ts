/**
 * Lightweight EXIF parser for JPEG files in Cloudflare Workers.
 * Extracts common EXIF/TIFF tags from APP1 marker without external dependencies.
 */

export interface ExifData {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  exposureTime?: string;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  focalLength35mm?: number;
  orientation?: number;
  colorSpace?: string;
  flash?: string;
  meteringMode?: string;
  whiteBalance?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  copyright?: string;
  artist?: string;
  imageWidth?: number;
  imageHeight?: number;
  lensModel?: string;
}

// TIFF tag IDs
const TAGS: Record<number, string> = {
  0x010f: 'make',
  0x0110: 'model',
  0x0131: 'software',
  0x0132: 'dateTime',
  0x8298: 'copyright',
  0x013b: 'artist',
  0x0112: 'orientation',
  0xa002: 'pixelXDimension',
  0xa003: 'pixelYDimension',
  0x0100: 'imageWidth',
  0x0101: 'imageHeight',
  // EXIF sub-IFD
  0x8769: 'exifIFD',
  0x8825: 'gpsIFD',
  // EXIF tags
  0x9003: 'dateTimeOriginal',
  0x829a: 'exposureTime',
  0x829d: 'fNumber',
  0x8827: 'iso',
  0x920a: 'focalLength',
  0xa405: 'focalLength35mm',
  0xa001: 'colorSpace',
  0x9209: 'flash',
  0x9207: 'meteringMode',
  0xa406: 'whiteBalance',
  0xa434: 'lensModel',
};

// GPS tag IDs
const GPS_TAGS: Record<number, string> = {
  0x0001: 'latRef',
  0x0002: 'lat',
  0x0003: 'lonRef',
  0x0004: 'lon',
  0x0005: 'altRef',
  0x0006: 'alt',
};

export function extractExif(buffer: ArrayBuffer): ExifData | null {
  const view = new DataView(buffer);

  // Check JPEG SOI marker
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null;

  let offset = 2;
  while (offset < view.byteLength - 2) {
    const marker = view.getUint16(offset);
    if (marker === 0xFFE1) {
      // APP1 marker — EXIF data
      const length = view.getUint16(offset + 2);
      return parseExifSegment(buffer, offset + 4, length - 2);
    }
    if ((marker & 0xFF00) !== 0xFF00) break;
    // Skip non-APP1 markers
    const segLen = view.getUint16(offset + 2);
    offset += 2 + segLen;
  }

  return null;
}

function parseExifSegment(buffer: ArrayBuffer, start: number, length: number): ExifData | null {
  const view = new DataView(buffer, start, Math.min(length, buffer.byteLength - start));

  // Check "Exif\0\0" header
  if (view.byteLength < 14) return null;
  if (
    view.getUint8(0) !== 0x45 || // E
    view.getUint8(1) !== 0x78 || // x
    view.getUint8(2) !== 0x69 || // i
    view.getUint8(3) !== 0x66 || // f
    view.getUint8(4) !== 0x00 ||
    view.getUint8(5) !== 0x00
  ) return null;

  const tiffStart = start + 6;
  const tiffView = new DataView(buffer, tiffStart);

  // Byte order
  const bo = tiffView.getUint16(0);
  const le = bo === 0x4949; // II = little endian
  if (bo !== 0x4949 && bo !== 0x4D4D) return null;

  // Verify TIFF magic 42
  if (tiffView.getUint16(2, le) !== 42) return null;

  const ifdOffset = tiffView.getUint32(4, le);

  const raw: Record<string, unknown> = {};
  readIFD(buffer, tiffStart, ifdOffset, le, TAGS, raw);

  // Read EXIF sub-IFD
  if (typeof raw.exifIFD === 'number') {
    readIFD(buffer, tiffStart, raw.exifIFD, le, TAGS, raw);
  }

  // Read GPS sub-IFD
  const gpsRaw: Record<string, unknown> = {};
  if (typeof raw.gpsIFD === 'number') {
    readIFD(buffer, tiffStart, raw.gpsIFD, le, GPS_TAGS, gpsRaw);
  }

  return buildExifData(raw, gpsRaw);
}

function readIFD(
  buffer: ArrayBuffer,
  tiffStart: number,
  ifdOffset: number,
  le: boolean,
  tagMap: Record<number, string>,
  out: Record<string, unknown>,
) {
  const abs = tiffStart + ifdOffset;
  if (abs + 2 > buffer.byteLength) return;

  const view = new DataView(buffer, tiffStart);
  let count: number;
  try {
    count = view.getUint16(ifdOffset, le);
  } catch { return; }

  for (let i = 0; i < count; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, le);
    const name = tagMap[tag];
    if (!name) continue;

    const type = view.getUint16(entryOffset + 2, le);
    const numValues = view.getUint32(entryOffset + 4, le);
    const valueOffset = entryOffset + 8;

    try {
      out[name] = readTagValue(view, type, numValues, valueOffset, le, buffer, tiffStart);
    } catch {
      // Skip unreadable tags
    }
  }
}

function readTagValue(
  view: DataView,
  type: number,
  count: number,
  valueOffset: number,
  le: boolean,
  buffer: ArrayBuffer,
  tiffStart: number,
): unknown {
  const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 12: 8 };
  const size = (typeSize[type] || 1) * count;
  const dataOffset = size > 4 ? view.getUint32(valueOffset, le) : valueOffset - (view.byteOffset - tiffStart);
  const absOffset = size > 4 ? dataOffset : valueOffset;

  switch (type) {
    case 2: { // ASCII
      const realOffset = size > 4 ? dataOffset : absOffset;
      const bytes = new Uint8Array(buffer, tiffStart + realOffset, Math.min(count - 1, 200));
      return new TextDecoder().decode(bytes).replace(/\0/g, '').trim();
    }
    case 3: { // SHORT
      if (count === 1) return view.getUint16(size > 4 ? tiffStart - view.byteOffset + dataOffset : absOffset, le);
      const arr: number[] = [];
      for (let i = 0; i < count; i++) {
        arr.push(view.getUint16((size > 4 ? tiffStart - view.byteOffset + dataOffset : absOffset) + i * 2, le));
      }
      return arr;
    }
    case 4: // LONG
      if (count === 1) return view.getUint32(size > 4 ? tiffStart - view.byteOffset + dataOffset : absOffset, le);
      return view.getUint32(size > 4 ? tiffStart - view.byteOffset + dataOffset : absOffset, le);
    case 5: // RATIONAL (unsigned)
    case 10: { // SRATIONAL (signed)
      const off = tiffStart - view.byteOffset + dataOffset;
      if (count === 1) {
        const num = type === 10 ? view.getInt32(off, le) : view.getUint32(off, le);
        const den = type === 10 ? view.getInt32(off + 4, le) : view.getUint32(off + 4, le);
        return den === 0 ? 0 : num / den;
      }
      const arr: number[] = [];
      for (let i = 0; i < count; i++) {
        const o = off + i * 8;
        const n = type === 10 ? view.getInt32(o, le) : view.getUint32(o, le);
        const d = type === 10 ? view.getInt32(o + 4, le) : view.getUint32(o + 4, le);
        arr.push(d === 0 ? 0 : n / d);
      }
      return arr;
    }
    case 1: // BYTE
    case 7: // UNDEFINED
      if (count === 1) return view.getUint8(absOffset);
      return view.getUint32(size > 4 ? tiffStart - view.byteOffset + dataOffset : absOffset, le);
    case 9: // SLONG
      return view.getInt32(size > 4 ? tiffStart - view.byteOffset + dataOffset : absOffset, le);
    default:
      return null;
  }
}

function buildExifData(raw: Record<string, unknown>, gps: Record<string, unknown>): ExifData {
  const result: ExifData = {};

  if (typeof raw.make === 'string') result.make = raw.make;
  if (typeof raw.model === 'string') result.model = raw.model;
  if (typeof raw.software === 'string') result.software = raw.software;
  if (typeof raw.dateTime === 'string') result.dateTime = raw.dateTime;
  if (typeof raw.dateTimeOriginal === 'string') result.dateTimeOriginal = raw.dateTimeOriginal;
  if (typeof raw.copyright === 'string') result.copyright = raw.copyright;
  if (typeof raw.artist === 'string') result.artist = raw.artist;
  if (typeof raw.lensModel === 'string') result.lensModel = raw.lensModel;

  if (typeof raw.orientation === 'number') result.orientation = raw.orientation;
  if (typeof raw.iso === 'number') result.iso = raw.iso;
  if (typeof raw.fNumber === 'number') result.fNumber = Math.round(raw.fNumber * 10) / 10;
  if (typeof raw.focalLength === 'number') result.focalLength = Math.round(raw.focalLength * 10) / 10;
  if (typeof raw.focalLength35mm === 'number') result.focalLength35mm = raw.focalLength35mm;

  // Exposure time
  if (typeof raw.exposureTime === 'number') {
    const et = raw.exposureTime;
    result.exposureTime = et >= 1 ? `${et}s` : `1/${Math.round(1 / et)}s`;
  }

  // Color space
  if (raw.colorSpace === 1) result.colorSpace = 'sRGB';
  else if (raw.colorSpace === 65535) result.colorSpace = 'Uncalibrated';

  // Flash
  if (typeof raw.flash === 'number') {
    result.flash = (raw.flash & 1) ? 'Fired' : 'No flash';
  }

  // Metering mode
  const meterMap: Record<number, string> = {
    1: 'Average', 2: 'Center-weighted', 3: 'Spot',
    4: 'Multi-spot', 5: 'Pattern', 6: 'Partial',
  };
  if (typeof raw.meteringMode === 'number') {
    result.meteringMode = meterMap[raw.meteringMode] || `Mode ${raw.meteringMode}`;
  }

  // White balance
  if (raw.whiteBalance === 0) result.whiteBalance = 'Auto';
  else if (raw.whiteBalance === 1) result.whiteBalance = 'Manual';

  // Dimensions from EXIF
  const w = raw.pixelXDimension ?? raw.imageWidth;
  const h = raw.pixelYDimension ?? raw.imageHeight;
  if (typeof w === 'number' && w > 0) result.imageWidth = w;
  if (typeof h === 'number' && h > 0) result.imageHeight = h;

  // GPS
  if (Array.isArray(gps.lat) && gps.lat.length === 3 && typeof gps.latRef === 'string') {
    const [d, m, s] = gps.lat as number[];
    let lat = d + m / 60 + s / 3600;
    if (gps.latRef === 'S') lat = -lat;
    result.gpsLatitude = Math.round(lat * 1000000) / 1000000;
  }
  if (Array.isArray(gps.lon) && gps.lon.length === 3 && typeof gps.lonRef === 'string') {
    const [d, m, s] = gps.lon as number[];
    let lon = d + m / 60 + s / 3600;
    if (gps.lonRef === 'W') lon = -lon;
    result.gpsLongitude = Math.round(lon * 1000000) / 1000000;
  }
  if (typeof gps.alt === 'number') {
    result.gpsAltitude = Math.round(gps.alt * 10) / 10;
  }

  // Only return if we found something
  const keys = Object.keys(result);
  return keys.length > 0 ? result : {};
}

/** Extract basic dimensions from PNG header (first 24 bytes) */
export function extractPngDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  if (buffer.byteLength < 24) return null;
  const view = new DataView(buffer);
  // PNG signature: 137 80 78 71 13 10 26 10
  if (view.getUint8(0) !== 0x89 || view.getUint8(1) !== 0x50) return null;
  // IHDR chunk at offset 16
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return { width, height };
}

/** Extract dimensions from JPEG SOF marker */
export function extractJpegDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null;

  let offset = 2;
  while (offset < view.byteLength - 8) {
    const marker = view.getUint16(offset);
    // SOF markers (SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15)
    if ((marker >= 0xFFC0 && marker <= 0xFFC3) || (marker >= 0xFFC5 && marker <= 0xFFCF && marker !== 0xFFC8)) {
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      return { width, height };
    }
    if ((marker & 0xFF00) !== 0xFF00) break;
    const segLen = view.getUint16(offset + 2);
    offset += 2 + segLen;
  }
  return null;
}
