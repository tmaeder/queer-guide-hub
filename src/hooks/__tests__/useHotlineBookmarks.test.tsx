/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useHotlineBookmarks } from '../useHotlineBookmarks';

const KEY = 'qg_help_bookmarks';

beforeEach(() => {
  localStorage.clear();
});

describe('useHotlineBookmarks', () => {
  it('starts empty when no localStorage entry', () => {
    const { result } = renderHook(() => useHotlineBookmarks());
    expect(result.current.bookmarkedIds.size).toBe(0);
  });

  it('hydrates from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify(['h1', 'h2']));
    const { result } = renderHook(() => useHotlineBookmarks());
    expect(result.current.isBookmarked('h1')).toBe(true);
    expect(result.current.isBookmarked('h2')).toBe(true);
  });

  it('falls back to empty on bad JSON', () => {
    localStorage.setItem(KEY, '{nope}');
    const { result } = renderHook(() => useHotlineBookmarks());
    expect(result.current.bookmarkedIds.size).toBe(0);
  });

  it('toggle adds, then removes, persisting to localStorage', () => {
    const { result } = renderHook(() => useHotlineBookmarks());

    act(() => result.current.toggle('h1'));
    expect(result.current.isBookmarked('h1')).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['h1']);

    act(() => result.current.toggle('h1'));
    expect(result.current.isBookmarked('h1')).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  });
});
