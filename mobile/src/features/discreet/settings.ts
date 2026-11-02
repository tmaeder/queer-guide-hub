import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/**
 * Discreet-mode settings. All local: there is no server-side flag, so nothing
 * about whether someone uses discreet mode ever leaves the device.
 *
 * Stored in the keychain/keystore rather than AsyncStorage so the settings
 * themselves are not readable from an unencrypted backup.
 */
export const ALTERNATE_ICONS = ['Atlas', 'Ink'] as const;
export type AppIcon = 'default' | (typeof ALTERNATE_ICONS)[number];

export const LOCK_AFTER_OPTIONS_MS = [0, 60_000, 5 * 60_000] as const;

export interface DiscreetSettings {
  /** Require Face ID / fingerprint / device passcode to open the app. */
  lockEnabled: boolean;
  /** Grace period after leaving the app before it locks again. */
  lockAfterMs: (typeof LOCK_AFTER_OPTIONS_MS)[number];
  /** Blur the app-switcher preview (iOS) / FLAG_SECURE (Android). */
  hideInSwitcher: boolean;
  /** Show a quick-exit button on Explore and Help. */
  quickExit: boolean;
  icon: AppIcon;
}

export const DEFAULTS: DiscreetSettings = {
  lockEnabled: false,
  lockAfterMs: 0,
  // On by default: an app-switcher snapshot of a queer venue map is an
  // outing risk on a shared or inspected phone, and the cost is small.
  hideInSwitcher: true,
  quickExit: false,
  icon: 'default',
};

export const STORAGE_KEY = 'qg.discreet.v1';

/** Merge stored JSON over defaults, dropping anything malformed. */
export function parseSettings(raw: string | null): DiscreetSettings {
  if (!raw) return DEFAULTS;
  let v: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;
    v = parsed as Record<string, unknown>;
  } catch {
    return DEFAULTS;
  }
  return {
    lockEnabled: typeof v.lockEnabled === 'boolean' ? v.lockEnabled : DEFAULTS.lockEnabled,
    lockAfterMs: (LOCK_AFTER_OPTIONS_MS as readonly unknown[]).includes(v.lockAfterMs)
      ? (v.lockAfterMs as DiscreetSettings['lockAfterMs'])
      : DEFAULTS.lockAfterMs,
    hideInSwitcher:
      typeof v.hideInSwitcher === 'boolean' ? v.hideInSwitcher : DEFAULTS.hideInSwitcher,
    quickExit: typeof v.quickExit === 'boolean' ? v.quickExit : DEFAULTS.quickExit,
    icon: (['default', ...ALTERNATE_ICONS] as unknown[]).includes(v.icon)
      ? (v.icon as AppIcon)
      : DEFAULTS.icon,
  };
}

export interface SettingsBackend {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export function createSettingsStore(backend: SettingsBackend) {
  let value: DiscreetSettings = DEFAULTS;
  let loaded = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    async load() {
      try {
        value = parseSettings(await backend.getItemAsync(STORAGE_KEY));
      } catch {
        value = DEFAULTS;
      }
      loaded = true;
      emit();
    },
    isLoaded: () => loaded,
    get: () => value,
    async update(patch: Partial<DiscreetSettings>) {
      value = parseSettings(JSON.stringify({ ...value, ...patch }));
      emit();
      await backend.setItemAsync(STORAGE_KEY, JSON.stringify(value));
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const discreetSettings = createSettingsStore({
  getItemAsync: (k) => SecureStore.getItemAsync(k),
  setItemAsync: (k, v) =>
    SecureStore.setItemAsync(k, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
});

export function useDiscreetSettings(): DiscreetSettings {
  return useSyncExternalStore(discreetSettings.subscribe, discreetSettings.get, discreetSettings.get);
}
