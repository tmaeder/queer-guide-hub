import { useCallback, useSyncExternalStore } from 'react';
import { useProfile } from './useProfile';
import { USER_MODE_VALUES, type UserMode } from '@/config/navigation';

/**
 * Resolves the active discovery mode. Logged-in users persist it on their
 * profile; anonymous users persist to localStorage so the mode still biases
 * trending/scope before sign-in. Both surfaces stay in sync via a tiny store.
 */

const KEY = 'qg-user-mode';
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function getLocal(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function isUserMode(v: string | null | undefined): v is UserMode {
  return !!v && (USER_MODE_VALUES as readonly string[]).includes(v);
}

export function useUserMode(): { mode: UserMode; setMode: (m: UserMode) => void; datingEnabled: boolean } {
  const { profile, updateProfile } = useProfile();

  const local = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener('storage', cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', cb);
      };
    },
    () => getLocal(),
    () => null,
  );

  const profileMode = profile?.user_mode as string | null | undefined;
  const mode: UserMode = isUserMode(profileMode) ? profileMode : isUserMode(local) ? local : 'community';

  const setMode = useCallback(
    (next: UserMode) => {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* ignore */
      }
      emit();
      // No-ops (returns auth error without a network call) for anonymous users.
      void updateProfile({ user_mode: next });
    },
    [updateProfile],
  );

  return { mode, setMode, datingEnabled: mode === 'dating' };
}
