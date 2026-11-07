import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Bbox } from './format';

/**
 * Where a pack's vector-tile archive (PMTiles) lives on the device. Kept as a
 * small interface so the service is testable without native modules; the
 * real implementation is tilesFs.ts.
 */
export interface TileFiles {
  /** Download to a unique, unreferenced file and return its URI. */
  download(url: string, id: string): Promise<string>;
  /** Stream the bytes at uri (for hashing without holding 50 MB at once). */
  chunks(uri: string): AsyncIterable<Uint8Array>;
  /** Delete exactly this file. Missing files are fine. */
  remove(uri: string): Promise<void>;
}

export async function digestTileChunks(chunks: AsyncIterable<Uint8Array>) {
  const h = sha256.create();
  let bytes = 0;
  for await (const chunk of chunks) {
    h.update(chunk);
    bytes += chunk.byteLength;
  }
  return { sha256: bytesToHex(h.digest()), bytes };
}

export function bboxContains([w, s, e, n]: Bbox, lng: number, lat: number) {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** MapLibre Native reads a local archive through its pmtiles:// protocol. */
export const pmtilesUrl = (fileUri: string) => `pmtiles://${fileUri}`;
