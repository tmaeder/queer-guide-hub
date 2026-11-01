import { createSavedStore, STORAGE_KEY, type SavedBackend } from '../savedStore';

function memory(initial?: string): SavedBackend & { data: Map<string, string> } {
  const data = new Map<string, string>(initial ? [[STORAGE_KEY, initial]] : []);
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
  };
}

const place = { slug: 'heaven', name: 'Heaven', category: 'club', city: 'London' };

describe('savedStore', () => {
  it('toggles a place on and off and persists each change', async () => {
    const backend = memory();
    const store = createSavedStore(backend);
    await store.load();
    await store.toggle(place, new Date('2026-11-01T12:00:00Z'));
    expect(store.has('heaven')).toBe(true);
    expect(JSON.parse(backend.data.get(STORAGE_KEY)!)).toEqual([
      { ...place, savedAt: '2026-11-01T12:00:00.000Z' },
    ]);
    await store.toggle(place);
    expect(store.has('heaven')).toBe(false);
    expect(JSON.parse(backend.data.get(STORAGE_KEY)!)).toEqual([]);
  });

  it('newest save first', async () => {
    const store = createSavedStore(memory());
    await store.load();
    await store.toggle({ ...place, slug: 'a' });
    await store.toggle({ ...place, slug: 'b' });
    expect(store.getAll().map((p) => p.slug)).toEqual(['b', 'a']);
  });

  it('survives a corrupt or malformed blob', async () => {
    const corrupt = createSavedStore(memory('{not json'));
    await corrupt.load();
    expect(corrupt.getAll()).toEqual([]);

    const mixed = createSavedStore(memory(JSON.stringify([place, { slug: 1 }, null])));
    await mixed.load();
    expect(mixed.getAll().map((p) => p.slug)).toEqual(['heaven']);
  });

  it('notifies subscribers', async () => {
    const store = createSavedStore(memory());
    const fn = jest.fn();
    store.subscribe(fn);
    await store.load();
    await store.toggle(place);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
