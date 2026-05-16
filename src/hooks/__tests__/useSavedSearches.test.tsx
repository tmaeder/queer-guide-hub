/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSavedSearches } from '../useSavedSearches';

const KEY = 'qg.marketplace.savedSearches';

beforeEach(() => {
  localStorage.clear();
});

describe('useSavedSearches', () => {
  it('starts empty when no localStorage entry', () => {
    const { result } = renderHook(() => useSavedSearches());
    expect(result.current.searches).toEqual([]);
  });

  it('hydrates from localStorage, dropping malformed entries', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: 'a', name: 'Berlin pride', query: '?tab=events', createdAt: 1 },
        { id: 'b', name: 'no query' }, // dropped — missing query
        { name: 'no id', query: '?x' }, // dropped — missing id
      ]),
    );

    const { result } = renderHook(() => useSavedSearches());
    expect(result.current.searches.map(s => s.id)).toEqual(['a']);
  });

  it("treats non-array JSON as empty", () => {
    localStorage.setItem(KEY, JSON.stringify({ id: 'a' }));
    const { result } = renderHook(() => useSavedSearches());
    expect(result.current.searches).toEqual([]);
  });

  it('falls back to [] on bad JSON', () => {
    localStorage.setItem(KEY, '{not-json}');
    const { result } = renderHook(() => useSavedSearches());
    expect(result.current.searches).toEqual([]);
  });

  it('save prepends a new entry and persists', () => {
    const { result } = renderHook(() => useSavedSearches());

    let created!: { id: string; name: string; query: string };
    act(() => {
      created = result.current.save('Madrid orgullo', '?tab=events&city=madrid');
    });

    expect(result.current.searches[0].id).toBe(created.id);
    expect(result.current.searches[0].name).toBe('Madrid orgullo');
    expect(result.current.searches[0].query).toBe('?tab=events&city=madrid');

    const stored = JSON.parse(localStorage.getItem(KEY)!) as Array<{ id: string }>;
    expect(stored[0].id).toBe(created.id);
  });

  it("save replaces an empty name with 'Untitled'", () => {
    const { result } = renderHook(() => useSavedSearches());
    act(() => {
      result.current.save('   ', '?x=1');
    });
    expect(result.current.searches[0].name).toBe('Untitled');
  });

  it('caps stored searches at 20 (newest first)', () => {
    const { result } = renderHook(() => useSavedSearches());
    act(() => {
      for (let i = 0; i < 25; i++) result.current.save(`s${i}`, `?n=${i}`);
    });
    expect(result.current.searches).toHaveLength(20);
    expect(result.current.searches[0].name).toBe('s24'); // newest first
  });

  it('remove drops by id and re-persists', () => {
    const { result } = renderHook(() => useSavedSearches());
    let firstId!: string;
    act(() => {
      const a = result.current.save('a', '?a');
      result.current.save('b', '?b');
      firstId = a.id;
    });

    act(() => result.current.remove(firstId));

    expect(result.current.searches.find(s => s.id === firstId)).toBeUndefined();
    const stored = JSON.parse(localStorage.getItem(KEY)!) as Array<{ id: string }>;
    expect(stored.find(s => s.id === firstId)).toBeUndefined();
  });

  it('refreshes on cross-tab storage events', () => {
    const { result } = renderHook(() => useSavedSearches());
    expect(result.current.searches).toEqual([]);

    act(() => {
      localStorage.setItem(
        KEY,
        JSON.stringify([{ id: 'x', name: 'from other tab', query: '?z', createdAt: 1 }]),
      );
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    });

    expect(result.current.searches[0].id).toBe('x');
  });
});
