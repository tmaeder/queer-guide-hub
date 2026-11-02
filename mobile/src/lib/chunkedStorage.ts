/**
 * Supabase auth storage on top of the platform keychain/keystore.
 *
 * A Supabase session (access + refresh token + user) is several KB, but
 * SecureStore values are meant to stay small (~2 KB), so a value is split
 * into chunks under `<key>.<n>` with the chunk count stored at `<key>`.
 *
 * The backend is injected so the chunking logic is unit-testable without
 * native modules; production passes expo-secure-store.
 */
export interface KeyValueBackend {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;

/** SecureStore keys may only contain [A-Za-z0-9._-]. */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function createChunkedStorage(backend: KeyValueBackend, chunkSize = CHUNK_SIZE) {
  async function removeItem(rawKey: string): Promise<void> {
    const key = safeKey(rawKey);
    const count = Number(await backend.getItemAsync(key));
    if (Number.isFinite(count) && count > 0) {
      await Promise.all(
        Array.from({ length: count }, (_, i) => backend.deleteItemAsync(`${key}.${i}`)),
      );
    }
    await backend.deleteItemAsync(key);
  }

  return {
    async getItem(rawKey: string): Promise<string | null> {
      const key = safeKey(rawKey);
      const header = await backend.getItemAsync(key);
      if (header == null) return null;
      const count = Number(header);
      if (!Number.isInteger(count) || count < 1) return null;
      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) => backend.getItemAsync(`${key}.${i}`)),
      );
      // A missing chunk means a torn write: treat the whole value as absent
      // rather than handing Supabase a truncated JSON session.
      if (parts.some((p) => p == null)) return null;
      return parts.join('');
    },

    async setItem(rawKey: string, value: string): Promise<void> {
      await removeItem(rawKey);
      const key = safeKey(rawKey);
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += chunkSize) chunks.push(value.slice(i, i + chunkSize));
      if (chunks.length === 0) chunks.push('');
      await Promise.all(chunks.map((c, i) => backend.setItemAsync(`${key}.${i}`, c)));
      // Header last, so a reader never sees a count whose chunks are unwritten.
      await backend.setItemAsync(key, String(chunks.length));
    },

    removeItem,
  };
}
