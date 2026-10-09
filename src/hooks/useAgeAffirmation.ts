import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'qg_age_affirmation';
const LEGACY_MARKETPLACE_KEY = 'qg.marketplace.ageAck';
// Same-tab broadcast: the `storage` event only fires in OTHER tabs, so without
// this the gate (one useAgeAffirmation instance) never notices the modal's
// affirm() (a different instance) until a reload.
const SYNC_EVENT = 'qg-age-affirmation-sync';

type Stored = { affirmedAt: number };

function readStored(): Stored | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<Stored>;
        if (typeof parsed?.affirmedAt === 'number' && Number.isFinite(parsed.affirmedAt)) {
          return { affirmedAt: parsed.affirmedAt };
        }
      } catch {
        // A corrupt canonical entry must not prevent legacy migration below.
      }
    }

    const legacy = localStorage.getItem(LEGACY_MARKETPLACE_KEY);
    if (!legacy) return null;
    const parsedLegacy = Date.parse(legacy);
    const migrated = { affirmedAt: Number.isFinite(parsedLegacy) ? parsedLegacy : Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

function hasAccountAffirmation(user: { user_metadata?: Record<string, unknown> } | null): boolean {
  return typeof user?.user_metadata?.age_confirmed_at === 'string';
}

function persistBrowserAffirmation(affirmedAt = Date.now()) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ affirmedAt } satisfies Stored));
    // Retain the old key during rollout so an older open tab also sees the
    // confirmation. All current readers use the canonical key.
    localStorage.setItem(LEGACY_MARKETPLACE_KEY, new Date(affirmedAt).toISOString());
  } catch {
    // Storage unavailable (private mode, quota); in-memory state still works.
  }
}

async function persistAccountAffirmation(affirmedAt: string): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await Promise.allSettled([
    supabase.auth.updateUser({ data: { age_confirmed_at: affirmedAt } }),
    supabase.from('profiles').update({ age_confirmed_at: affirmedAt }).eq('user_id', data.user.id),
  ]);
}

/**
 * Tracks the visitor's "I am 18 or older" affirmation for adult-content
 * subtrees (Tags, Marketplace and Intimate/Dating). Browser confirmation is
 * durable, legacy Marketplace consent migrates automatically, and signed-in
 * account consent restores it on other devices.
 */
export function useAgeAffirmation() {
  const [affirmed, setAffirmed] = useState<boolean>(() => !!readStored());

  const affirm = useCallback(async () => {
    const now = Date.now();
    persistBrowserAffirmation(now);
    setAffirmed(true);
    // Notify sibling instances in THIS tab (e.g. the gate) so gated content
    // reveals in place instead of only after a reload.
    window.dispatchEvent(new Event(SYNC_EVENT));
    await persistAccountAffirmation(new Date(now).toISOString()).catch(() => undefined);
  }, []);

  const revoke = useCallback(() => {
    try {
      // Legacy first: cross-tab storage events then cannot recreate canonical
      // state from a legacy key that still exists.
      localStorage.removeItem(LEGACY_MARKETPLACE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Same as above — best-effort.
    }
    setAffirmed(false);
    window.dispatchEvent(new Event(SYNC_EVENT));
  }, []);

  // Keep state in sync with storage events from other tabs + same-tab siblings.
  useEffect(() => {
    const resync = () => setAffirmed(!!readStored());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY && e.key !== LEGACY_MARKETPLACE_KEY) return;
      resync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC_EVENT, resync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SYNC_EVENT, resync);
    };
  }, []);

  // Signup already requires the same 18+ affirmation. Adopt that durable
  // account proof; older accounts fall back to the profiles column.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (!user) return;
      if (hasAccountAffirmation(user)) {
        persistBrowserAffirmation(
          Date.parse(String(user.user_metadata.age_confirmed_at)) || Date.now(),
        );
        setAffirmed(true);
        window.dispatchEvent(new Event(SYNC_EVENT));
        return;
      }

      void supabase
        .from('profiles')
        .select('age_confirmed_at')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data?.age_confirmed_at) return;
          persistBrowserAffirmation(Date.parse(data.age_confirmed_at) || Date.now());
          setAffirmed(true);
          window.dispatchEvent(new Event(SYNC_EVENT));
        });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { affirmed, affirm, revoke } as const;
}
