import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'qg.marketplace.savedSearches';

export interface SavedSearch {
  id: string;
  name: string;
  query: string; // URL search string e.g. "?tab=products&sort=price_asc"
  createdAt: number;
}

function load(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => s.id && s.name && s.query) : [];
  } catch {
    return [];
  }
}

function persist(searches: SavedSearch[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  } catch {
    /* quota / unavailable — silently ignore */
  }
}

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    setSearches(load());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSearches(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((name: string, query: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: SavedSearch = { id, name: name.trim() || 'Untitled', query, createdAt: Date.now() };
    setSearches((prev) => {
      const merged = [next, ...prev].slice(0, 20);
      persist(merged);
      return merged;
    });
    return next;
  }, []);

  const remove = useCallback((id: string) => {
    setSearches((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { searches, save, remove };
}
