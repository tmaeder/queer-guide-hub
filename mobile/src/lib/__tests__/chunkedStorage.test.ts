import { createChunkedStorage, safeKey, type KeyValueBackend } from '../chunkedStorage';

function memoryBackend() {
  const map = new Map<string, string>();
  const backend: KeyValueBackend = {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
  return { map, backend };
}

describe('createChunkedStorage', () => {
  it('round-trips a value larger than one chunk', async () => {
    const { map, backend } = memoryBackend();
    const s = createChunkedStorage(backend, 10);
    const value = 'x'.repeat(35);
    await s.setItem('sb-auth', value);
    expect(map.get('sb-auth')).toBe('4');
    expect(await s.getItem('sb-auth')).toBe(value);
  });

  it('removes stale chunks when a shorter value overwrites a longer one', async () => {
    const { map, backend } = memoryBackend();
    const s = createChunkedStorage(backend, 10);
    await s.setItem('k', 'a'.repeat(30));
    await s.setItem('k', 'short');
    expect(await s.getItem('k')).toBe('short');
    expect([...map.keys()].sort()).toEqual(['k', 'k.0']);
  });

  it('returns null for a torn write instead of a truncated session', async () => {
    const { map, backend } = memoryBackend();
    const s = createChunkedStorage(backend, 10);
    await s.setItem('k', 'b'.repeat(25));
    map.delete('k.1');
    expect(await s.getItem('k')).toBeNull();
  });

  it('removeItem deletes header and every chunk', async () => {
    const { map, backend } = memoryBackend();
    const s = createChunkedStorage(backend, 4);
    await s.setItem('k', 'abcdefghij');
    await s.removeItem('k');
    expect(map.size).toBe(0);
  });

  it('stores the empty string as one empty chunk', async () => {
    const { backend } = memoryBackend();
    const s = createChunkedStorage(backend);
    await s.setItem('k', '');
    expect(await s.getItem('k')).toBe('');
  });

  it('sanitises keys SecureStore would reject', () => {
    expect(safeKey('sb-xqe-auth-token:code/verifier')).toBe('sb-xqe-auth-token_code_verifier');
  });
});
