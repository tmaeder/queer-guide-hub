import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Bbox } from './format';

/**
 * Where a pack's vector-tile archive (PMTiles) lives on the device. Kept as a
 * small interface so the service is testable without native modules; the
 * real implementation is tilesFs.ts.
 */
export interface TileFiles {
  /** Download to a temporary location; resolves to its uri. */
  download(url: string, id: string): Promise<string>;
  /** Stream the bytes at uri (for hashing without holding 50 MB at once). */
  chunks(uri: string): AsyncIterable<Uint8Array>;
  /** Move a verified temporary download into place; resolves to the final uri. */
  commit(tempUri: string, id: string): Promise<string>;
  /** Delete the pack's archive and any partial download. Missing files are fine. */
  remove(id: string): Promise<void>;
}

export async function sha256OfChunks(chunks: AsyncIterable<Uint8Array>): Promise<string> {
  const h = sha256.create();
  for await (const c of chunks) h.update(c);
  return bytesToHex(h.digest());
}

export function bboxContains([w, s, e, n]: Bbox, lng: number, lat: number) {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** MapLibre Native reads a local archive through its pmtiles:// protocol. */
export const pmtilesUrl = (fileUri: string) => `pmtiles://${fileUri}`;
