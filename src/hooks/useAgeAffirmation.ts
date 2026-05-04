import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'qg_age_affirmation';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type Stored = { affirmedAt: number };

function readStored(): Stored | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed?.affirmedAt !== 'number') return null;
    return { affirmedAt: parsed.affirmedAt };
  } catch {
    return null;
  }
}

function isFresh(s: Stored | null): boolean {
  return !!s && Date.now() - s.affirmedAt < TTL_MS;
}

/**
 * Tracks the visitor's "I am 18 or older" affirmation for adult-content
 * subtrees (Sexuality & Kink, Fetishes, etc.). Persisted in localStorage
 * with a 30-day TTL; cleared automatically on sign-out so a shared device
 * doesn't leak the affirmation across accounts.
 *
 * P0-3 — bug report docs/bugreports/2026-05-04-queerguide-resources.md.
 */
export function useAgeAffirmation() {
  const [affirmed, setAffirmed] = useState<boolean>(() => isFresh(readStored()));

  const affirm = useCallback(() => {
    const next: Stored = { affirmedAt: Date.now() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode, quota); session-only affirmation
      // is acceptable — user can re-affirm on next page load.
    }
    setAffirmed(true);
  }, []);

  const revoke = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Same as above — best-effort.
    }
    setAffirmed(false);
  }, []);

  // Keep state in sync with storage events from other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setAffirmed(isFresh(readStored()));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Clear on sign-out so subsequent visitors re-affirm.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') revoke();
    });
    return () => sub.subscription.unsubscribe();
  }, [revoke]);

  return { affirmed, affirm, revoke } as const;
}
