jest.mock('@/lib/supabase', () => ({ supabase: {} }));
import { createSavedStore, type SavedPlace } from '../savedStore';
import { mergeSaved, syncOnSignIn, syncSavedOnAuth, toggleSavedPlace, type SyncDeps } from '../sync';

const place = (slug: string, over: Partial<SavedPlace> = {}): SavedPlace => ({
  slug,
  name: slug,
  category: 'bar',
  city: 'Zurich',
  savedAt: '2026-11-01T10:00:00Z',
  ...over,
});

function memoryStore() {
  const mem = new Map<string, string>();
  return createSavedStore({
    getItem: async (k) => mem.get(k) ?? null,
    setItem: async (k, v) => void mem.set(k, v),
  });
}

function fakeDeps(remote: SavedPlace[] = [], ids: Record<string, string> = {}) {
  const added: string[] = [];
  const removed: string[] = [];
  const deps: SyncDeps = {
    listFavorites: async () => remote,
    venueIdsForSlugs: async (slugs) => Object.fromEntries(slugs.filter((s) => ids[s]).map((s) => [s, ids[s]!])),
    addFavorite: async (_u, id) => void added.push(id),
    removeFavorite: async (_u, id) => void removed.push(id),
  };
  return { deps, added, removed };
}

it('merges by slug and keeps the account entry (it has the venue id)', () => {
  const out = mergeSaved([place('a'), place('b')], [place('b', { venueId: 'vb' })]);
  expect(out.find((p) => p.slug === 'b')?.venueId).toBe('vb');
  expect(out).toHaveLength(2);
});

it('uploads places saved on the phone before signing in, resolving their ids', async () => {
  const { deps, added } = fakeDeps([place('remote', { venueId: 'vr' })], { phone: 'vp' });
  const out = await syncOnSignIn('u1', [place('phone')], deps);
  expect(added).toEqual(['vp']);
  expect(out.map((p) => p.slug).sort()).toEqual(['phone', 'remote']);
});

it('keeps a place that no longer resolves instead of dropping it silently', async () => {
  const { deps, added } = fakeDeps([], {});
  const out = await syncOnSignIn('u1', [place('gone')], deps);
  expect(added).toEqual([]);
  expect(out.map((p) => p.slug)).toEqual(['gone']);
});

it('signed in, writes the account before the phone so a failure changes neither', async () => {
  const store = memoryStore();
  await store.load();
  const failing: SyncDeps = { ...fakeDeps().deps, addFavorite: async () => Promise.reject(new Error('offline')) };
  await expect(toggleSavedPlace(store, { ...place('x'), venueId: 'vx' }, 'u1', failing)).rejects.toThrow();
  expect(store.has('x')).toBe(false);

  const { deps, added, removed } = fakeDeps();
  await toggleSavedPlace(store, { ...place('x'), venueId: 'vx' }, 'u1', deps);
  await toggleSavedPlace(store, { ...place('x'), venueId: 'vx' }, 'u1', deps);
  expect(added).toEqual(['vx']);
  expect(removed).toEqual(['vx']);
});

it('signed out, saving stays on the phone only', async () => {
  const store = memoryStore();
  await store.load();
  const { deps, added } = fakeDeps();
  await toggleSavedPlace(store, { ...place('x'), venueId: 'vx' }, null, deps);
  expect(store.has('x')).toBe(true);
  expect(added).toEqual([]);
});

describe('auth events', () => {
  async function run(events: [string, string | null][], remote: SavedPlace[] = []) {
    const store = memoryStore();
    await store.load();
    await store.replaceAll([place('phone-only')]);
    let emit: (e: string, u: string | null) => void = () => {};
    syncSavedOnAuth(store, (cb) => ((emit = cb), () => {}), fakeDeps(remote, { 'phone-only': 'vp' }).deps);
    for (const [e, u] of events) {
      emit(e, u);
      await new Promise((r) => setTimeout(r, 0));
    }
    return store;
  }

  it('signing out removes the account list from the phone', async () => {
    const store = await run([['INITIAL_SESSION', 'u1'], ['SIGNED_OUT', null]], [place('acct', { venueId: 'va' })]);
    expect(store.getAll()).toEqual([]);
  });

  it('a different user signing in never sees the previous account list', async () => {
    const store = await run([['INITIAL_SESSION', 'u1'], ['SIGNED_IN', 'u2']], [place('acct', { venueId: 'va' })]);
    // 'phone-only' was merged into u1's list; it must not follow onto u2's phone list.
    expect(store.getAll().map((p) => p.slug)).toEqual(['acct']);
  });

  it('a visitor who is not signed in keeps the phone list', async () => {
    const store = await run([['INITIAL_SESSION', null]]);
    expect(store.getAll().map((p) => p.slug)).toEqual(['phone-only']);
  });
});
