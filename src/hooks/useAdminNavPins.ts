/**
 * useAdminNavPins — per-browser pinned admin nav items.
 * localStorage-only (mirrors the `admin.cmdk.recent` precedent); no DB, no migration.
 * Shared by the sidebar (Pinned pseudo-section) and the command palette.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'admin.nav.pins';
const EVENT = 'admin-nav-pins-changed';

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(pins: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // ignore quota / private-mode failures
  }
}

export function useAdminNavPins() {
  const [pins, setPins] = useState<string[]>(read);

  useEffect(() => {
    const sync = () => setPins(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const togglePin = useCallback((id: string) => {
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      write(next);
      return next;
    });
  }, []);

  const isPinned = useCallback((id: string) => pins.includes(id), [pins]);

  return { pins, togglePin, isPinned };
}
