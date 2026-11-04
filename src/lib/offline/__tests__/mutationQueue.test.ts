/**
 * @vitest-environment jsdom
 *
 * jsdom has no IndexedDB — a minimal in-memory shim is enough to exercise
 * the queue's coalescing and lifecycle logic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

class FakeRequest<T> {
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result!: T;
  error: unknown = null;
  resolve(value: T) {
    this.result = value;
    queueMicrotask(() => this.onsuccess?.());
  }
}

function makeFakeIndexedDb() {
  const rows = new Map<string, unknown>();
  const store = {
    get: (key: string) => {
      const r = new FakeRequest<unknown>();
      r.resolve(rows.get(key));
      return r;
    },
    put: (value: { key: string }) => {
      const r = new FakeRequest<unknown>();
      rows.set(value.key, value);
      r.resolve(undefined);
      return r;
    },
    delete: (key: string) => {
      const r = new FakeRequest<unknown>();
      rows.delete(key);
      r.resolve(undefined);
      return r;
    },
    getAll: () => {
      const r = new FakeRequest<unknown[]>();
      r.resolve([...rows.values()]);
      return r;
    },
    count: () => {
      const r = new FakeRequest<number>();
      r.resolve(rows.size);
      return r;
    },
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const transaction = { objectStore: () => store, oncomplete: null as (() => void) | null };
      setTimeout(() => transaction.oncomplete?.(), 0);
      return transaction;
    },
    close: () => {},
    createObjectStore: () => store,
  };
  return {
    rows,
    open: () => {
      const r = new FakeRequest<typeof db>();
      r.resolve(db);
      return r;
    },
  };
}

let fake: ReturnType<typeof makeFakeIndexedDb>;

beforeEach(() => {
  fake = makeFakeIndexedDb();
  vi.stubGlobal('indexedDB', { open: fake.open });
});

import { enqueueMutation, listMutations, removeMutation, countMutations } from '../mutationQueue';

describe('mutationQueue', () => {
  it('enqueues a mutation', async () => {
    await enqueueMutation('alice', 'trip_packing_items', 'i1', 't1', { is_checked: true });
    const rows = await listMutations('alice');
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('alice:trip_packing_items:i1');
    expect(rows[0].patch).toEqual({ is_checked: true });
  });

  it('coalesces patches per row (last field value wins)', async () => {
    await enqueueMutation('alice', 'trip_places', 'p1', 't1', { notes: 'a' });
    await enqueueMutation('alice', 'trip_places', 'p1', 't1', { notes: 'b', sort_order: 3 });
    const rows = await listMutations('alice');
    expect(rows).toHaveLength(1);
    expect(rows[0].patch).toEqual({ notes: 'b', sort_order: 3 });
  });

  it('keeps separate rows separate', async () => {
    await enqueueMutation('alice', 'trip_places', 'p1', 't1', { notes: 'a' });
    await enqueueMutation('alice', 'trip_packing_items', 'p1', 't1', { is_checked: false });
    expect(await countMutations('alice')).toBe(2);
  });

  it('removes by key', async () => {
    await enqueueMutation('alice', 'trip_places', 'p1', 't1', { notes: 'a' });
    await removeMutation((await listMutations('alice'))[0]);
    expect(await countMutations('alice')).toBe(0);
  });

  it('keeps accounts separate and preserves an edit made while replay is in flight', async () => {
    await enqueueMutation('alice', 'trip_places', 'p1', 't1', { notes: 'old' });
    const [inFlight] = await listMutations('alice');
    expect(await listMutations('bob')).toEqual([]);
    await enqueueMutation('alice', 'trip_places', 'p1', 't1', { notes: 'new' });
    await removeMutation(inFlight);
    expect((await listMutations('alice'))[0].patch).toEqual({ notes: 'new' });
  });

  it('preserves tripId across coalesced patches', async () => {
    await enqueueMutation('alice', 'trip_places', 'p1', 't1', { notes: 'a' });
    await enqueueMutation('alice', 'trip_places', 'p1', null, { sort_order: 1 });
    const [row] = await listMutations('alice');
    expect(row.tripId).toBe('t1');
  });
});
