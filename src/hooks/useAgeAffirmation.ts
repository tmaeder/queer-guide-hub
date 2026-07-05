import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'qg_age_affirmation';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Same-tab broadcast: the `storage` event only fires in OTHER tabs, so without
// this the gate (one useAgeAffirmation instance) never notices the modal's
// affirm() (a different instance) until a reload.
const SYNC_EVENT = 'qg-age-affirmation-sync';

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
    // Notify sibling instances in THIS tab (e.g. the gate) so gated content
    // reveals in place instead of only after a reload.
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  const revoke = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Same as above — best-effort.
    }
    setAffirmed(false);
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  // Keep state in sync with storage events from other tabs + same-tab siblings.
  useEffect(() => {
    const resync = () => setAffirmed(isFresh(readStored()));
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      resync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC_EVENT, resync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SYNC_EVENT, resync);
    };
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
