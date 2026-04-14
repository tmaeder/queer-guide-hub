import { useState, useCallback } from 'react';

const STORAGE_KEY = 'qg_help_bookmarks';

function readBookmarks(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeBookmarks(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function useHotlineBookmarks() {
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(readBookmarks);

  const isBookmarked = useCallback((id: string) => bookmarkedIds.has(id), [bookmarkedIds]);

  const toggle = useCallback((id: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeBookmarks(next);
      return next;
    });
  }, []);

  return { bookmarkedIds, isBookmarked, toggle };
}
