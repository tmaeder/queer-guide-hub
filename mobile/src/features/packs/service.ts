import { PackError, type PackIndex, type PackIndexEntry } from './format';
import { getMeta, installPack, removePack, setMeta, type PackDb } from './store';
import { sha256OfChunks, type TileFiles } from './tiles';
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
      // Tiles first: if the archive fails to download or verify, the old
      // version of the pack (data and tiles) stays exactly as it was.
      let tilesUri: string | undefined;
      if (entry.tiles && tiles) {
        let temp: string;
        try {
          temp = await tiles.download(`${base()}/${encodeURIComponent(entry.tiles.file)}`, entry.id);
        } catch (e) {
          throw new PackError('network', e instanceof Error ? e.message : 'Tile download failed');
        }
        if ((await sha256OfChunks(tiles.chunks(temp))) !== entry.tiles.sha256) {
          await tiles.remove(entry.id);
          throw new PackError('digest_mismatch', `Map tiles for ${entry.id} do not match their signed digest`);
        }
        tilesUri = await tiles.commit(temp, entry.id);
      }
      await installPack(db, pack, entry, tilesUri);
      if (!tilesUri && tiles) await tiles.remove(entry.id);
      return pack;
    },

    async remove(id: string) {
      await removePack(db, id);
      await tiles?.remove(id);
    },
  };
}

export type PackService = ReturnType<typeof createPackService>;
