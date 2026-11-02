import { PackError, type PackIndex, type PackIndexEntry } from './format';
import { getMeta, installPack, removePack, setMeta, type PackDb } from './store';
import { verifyIndex, verifyPack } from './verify';

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

export function createPackService(db: PackDb, config: PackConfig = packConfig, get: FetchText = fetchText) {
  const base = () => {
    if (!packsConfigured(config)) throw new PackError('not_configured', 'Offline packs are not set up in this build');
    return config.baseUrl!.replace(/\/+$/, '');
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
      await installPack(db, pack, entry);
      return pack;
    },

    remove(id: string) {
      return removePack(db, id);
    },
  };
}

export type PackService = ReturnType<typeof createPackService>;
