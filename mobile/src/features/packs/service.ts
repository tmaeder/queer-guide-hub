import { PackError, type PackIndex, type PackIndexEntry } from './format';
import { getMeta, installPack, removePack, setMeta, type PackDb } from './store';
import { digestTileChunks, type TileFiles } from './tiles';
import { verifyIndex, verifyPack } from './verify';
import { trimTrailingSlashes } from '@/lib/trimTrailingSlashes';

export const LAST_INDEX_KEY = 'last_index_generated_at';

export interface PackConfig {
  /** https origin + path the index and packs are served from, no trailing slash */
  baseUrl: string | undefined;
  /** hex ed25519 public key; the private half never leaves the build machine */
  publicKey: string | undefined;
}

export const packConfig: PackConfig = {
  baseUrl: process.env.EXPO_PUBLIC_PACK_BASE_URL,
  publicKey: process.env.EXPO_PUBLIC_PACK_PUBLIC_KEY,
};

export const packsConfigured = (c: PackConfig = packConfig) =>
  !!c.baseUrl && /^https:\/\//.test(c.baseUrl) && !!c.publicKey;

type FetchText = (url: string) => Promise<string>;

export const fetchText: FetchText = async (url) => {
  let res: Response;
  try {
    // no-store: a cached index would defeat the rollback check's purpose
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    throw new PackError('network', e instanceof Error ? e.message : 'Network error');
  }
  if (!res.ok) throw new PackError('network', `HTTP ${res.status} for ${url}`);
  return res.text();
};

export function createPackService(
  db: PackDb,
  config: PackConfig = packConfig,
  get: FetchText = fetchText,
  tiles?: TileFiles,
) {
  const base = () => {
    if (!packsConfigured(config)) throw new PackError('not_configured', 'Offline packs are not set up in this build');
    return trimTrailingSlashes(config.baseUrl!);
  };
  // The database already committed, or the operation already failed. A
  // cleanup error should leave an unreferenced file rather than change that result.
  const cleanup = async (uri?: string) => {
    if (uri) await tiles?.remove(uri).catch(() => {});
  };

  return {
    async fetchIndex(): Promise<PackIndex> {
      const text = await get(`${base()}/index.json`);
      const index = verifyIndex(text, config.publicKey, await getMeta(db, LAST_INDEX_KEY));
      await setMeta(db, LAST_INDEX_KEY, index.generated_at);
      return index;
    },

    /** Download, verify against the signed digest, then import. Nothing is written unless it verifies. */
    async install(entry: PackIndexEntry) {
      const text = await get(`${base()}/${encodeURIComponent(entry.id)}.json`);
      const pack = verifyPack(text, entry);
      let tilesUri: string | undefined;
      let previousTilesUri: string | undefined;
      try {
        if (entry.tiles && tiles) {
          try {
            tilesUri = await tiles.download(`${base()}/${encodeURIComponent(entry.tiles.file)}`, entry.id);
          } catch (e) {
            throw new PackError('network', e instanceof Error ? e.message : 'Tile download failed');
          }
          const digest = await digestTileChunks(tiles.chunks(tilesUri));
          if (digest.sha256 !== entry.tiles.sha256 || digest.bytes !== entry.tiles.bytes) {
            throw new PackError('digest_mismatch', `Map tiles for ${entry.id} do not match their signed metadata`);
          }
        }
        previousTilesUri = await installPack(db, pack, entry, tilesUri);
      } catch (error) {
        await cleanup(tilesUri);
        throw error;
      }
      await cleanup(previousTilesUri);
      return pack;
    },

    async remove(id: string) {
      await cleanup(await removePack(db, id));
    },
  };
}
