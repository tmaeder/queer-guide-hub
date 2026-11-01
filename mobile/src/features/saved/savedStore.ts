import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * Saved places, kept ONLY on this device. Nothing here is sent anywhere; a
 * signed-in sync to the web's favourites is a later, opt-in change.
 *
 * A small snapshot is stored with each slug so the Saved tab renders offline.
 */
export interface SavedPlace {
  slug: string;
  name: string;
  category: string;
  city: string | null;
  savedAt: string;
}

export const STORAGE_KEY = 'qg.saved.v1';

type Listener = () => void;

export interface SavedBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function createSavedStore(backend: SavedBackend) {
  let items: SavedPlace[] = [];
  let loaded = false;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l());

  async function persist() {
    await backend.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  return {
    async load() {
      try {
        const raw = await backend.getItem(STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        items = Array.isArray(parsed)
          ? parsed.filter((p): p is SavedPlace => typeof p?.slug === 'string' && typeof p?.name === 'string')
          : [];
      } catch {
        items = []; // a corrupt blob must not crash the app
      }
      loaded = true;
      emit();
    },
    isLoaded: () => loaded,
    getAll: () => items,
    has: (slug: string) => items.some((p) => p.slug === slug),
    async toggle(place: Omit<SavedPlace, 'savedAt'>, now = new Date()) {
      items = items.some((p) => p.slug === place.slug)
        ? items.filter((p) => p.slug !== place.slug)
        : [{ ...place, savedAt: now.toISOString() }, ...items];
      emit();
      await persist();
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const savedStore = createSavedStore(AsyncStorage);

export function useSaved() {
  return useSyncExternalStore(savedStore.subscribe, savedStore.getAll, savedStore.getAll);
}
