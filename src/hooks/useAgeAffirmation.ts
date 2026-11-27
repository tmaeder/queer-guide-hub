import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';

const STORAGE_KEY = 'qg_age_affirmation';
const LEGACY_MARKETPLACE_KEY = 'qg.marketplace.ageAck';
// Same-tab broadcast: the `storage` event only fires in OTHER tabs, so without
// this the gate (one useAgeAffirmation instance) never notices the modal's
// affirm() (a different instance) until a reload.
const SYNC_EVENT = 'qg-age-affirmation-sync';

type Stored = { affirmedAt: number };
type AccountUser = { id: string; user_metadata?: Record<string, unknown> };

export type AgeAffirmationStatus = 'checking' | 'affirmed' | 'unaffirmed';

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

function metadataAffirmedAt(user: AccountUser | null): string | null {
  const value = user?.user_metadata?.age_confirmed_at;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
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

async function persistAccountAffirmation(
  affirmedAt: string,
  knownUser?: AccountUser | null,
): Promise<unknown | null> {
  const user = knownUser ?? (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  // The profile is the durable, auditable source of truth. Selecting the
  // updated row is deliberate: an RLS-blocked UPDATE can otherwise look like a
  // successful request that changed zero rows.
  // `authenticated` has no column grant on age_confirmed_at, so the write goes
  // through a definer RPC scoped to the caller's own row.
  const profileResult = await untypedRpc<string | null>('set_my_age_confirmation', {
    p_confirmed: true,
  });

  if (profileResult.error) return profileResult.error;
  if (!profileResult.data) {
    return new Error('Profile confirmation was not saved');
  }

  // A metadata write emits USER_UPDATED. Only emit it after the canonical
  // profile write succeeds, or a missing profile repeatedly retries itself.
  const metadataResult = await supabase.auth.updateUser({
    data: { age_confirmed_at: affirmedAt },
  });
  return metadataResult.error ?? null;
}

/**
 * Tracks the visitor's "I am 18 or older" affirmation for adult-content
 * subtrees (Tags, Marketplace and Intimate/Dating). Browser confirmation is
 * durable, legacy Marketplace consent migrates automatically, and signed-in
 * account consent restores it on other devices.
 */
export function useAgeAffirmation() {
  const [status, setStatus] = useState<AgeAffirmationStatus>(() =>
    readStored() ? 'affirmed' : 'checking',
  );
  const [accountSyncError, setAccountSyncError] = useState<unknown | null>(null);
  const resolutionId = useRef(0);
  const affirmed = status === 'affirmed';

  const affirm = useCallback(async () => {
    resolutionId.current += 1;
    const now = Date.now();
    persistBrowserAffirmation(now);
    setStatus('affirmed');
    setAccountSyncError(null);
    // Notify sibling instances in THIS tab (e.g. the gate) so gated content
    // reveals in place instead of only after a reload.
    window.dispatchEvent(new Event(SYNC_EVENT));
    try {
      const error = await persistAccountAffirmation(new Date(now).toISOString());
      setAccountSyncError(error);
    } catch (error) {
      setAccountSyncError(error);
    }
  }, []);

  const revoke = useCallback(() => {
    resolutionId.current += 1;
    try {
      // Legacy first: cross-tab storage events then cannot recreate canonical
      // state from a legacy key that still exists.
      localStorage.removeItem(LEGACY_MARKETPLACE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Same as above — best-effort.
    }
    setStatus('unaffirmed');
    setAccountSyncError(null);
    window.dispatchEvent(new Event(SYNC_EVENT));
    // "Off revokes it everywhere": clear both account copies too, or the next
    // load restores the affirmation from them.
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await untypedRpc('set_my_age_confirmation', { p_confirmed: false });
      await supabase.auth.updateUser({ data: { age_confirmed_at: null } });
    })().catch(setAccountSyncError);
  }, []);

  // Keep state in sync with storage events from other tabs + same-tab siblings.
  useEffect(() => {
    const resync = () => {
      resolutionId.current += 1;
      setStatus(readStored() ? 'affirmed' : 'unaffirmed');
    };
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

  // Resolve the durable account record before declaring a signed-in reader
  // unaffirmed. Without the explicit checking state, the modal flashes (and is
  // actionable) while this query is still in flight.
  useEffect(() => {
    let disposed = false;

    const resolveAccount = async (user: AccountUser | null) => {
      if (disposed) return;
      const currentResolution = ++resolutionId.current;
      const cached = readStored();

      if (!user) {
        if (!disposed && currentResolution === resolutionId.current) {
          setStatus(cached ? 'affirmed' : 'unaffirmed');
          setAccountSyncError(null);
        }
        return;
      }

      if (!cached) setStatus('checking');

      // Own row through the definer self-read: a direct select of this column is
      // denied by the profiles column allowlist.
      const profileResult = await supabase.rpc('get_my_profile').maybeSingle();

      if (disposed || currentResolution !== resolutionId.current) return;

      const profileTimestamp = profileResult.data?.age_confirmed_at ?? null;
      const metadataTimestamp = metadataAffirmedAt(user);
      const durableTimestamp = profileTimestamp ?? metadataTimestamp;

      if (durableTimestamp) {
        persistBrowserAffirmation(Date.parse(durableTimestamp) || Date.now());
        setStatus('affirmed');
        setAccountSyncError(profileResult.error);
        window.dispatchEvent(new Event(SYNC_EVENT));

        // Older accounts may only carry the signup metadata. Repair the
        // canonical profile record while the proof is available.
        if (!profileTimestamp && metadataTimestamp) {
          void persistAccountAffirmation(metadataTimestamp, user)
            .then(setAccountSyncError)
            .catch(setAccountSyncError);
        }
        return;
      }

      if (profileResult.error) {
        // Do not turn a failed account lookup into another consent prompt.
        // A cached affirmation remains usable; otherwise the gate stays in its
        // neutral placeholder state until auth emits another resolvable event.
        setStatus(cached ? 'affirmed' : 'checking');
        setAccountSyncError(profileResult.error);
        return;
      }

      if (cached) {
        setStatus('affirmed');
        void persistAccountAffirmation(new Date(cached.affirmedAt).toISOString(), user)
          .then(setAccountSyncError)
          .catch(setAccountSyncError);
        return;
      }

      setStatus('unaffirmed');
      setAccountSyncError(null);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase recommends keeping this callback synchronous; defer the data
      // request so auth's internal lock is released first.
      window.setTimeout(() => void resolveAccount(session?.user ?? null), 0);
    });

    return () => {
      disposed = true;
      resolutionId.current += 1;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    status,
    checking: status === 'checking',
    affirmed,
    accountSyncError,
    affirm,
    revoke,
  } as const;
}
