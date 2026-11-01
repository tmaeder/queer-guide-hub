import { canEnableLock, shouldLockOnResume } from '../lockPolicy';
import { createSettingsStore, DEFAULTS, parseSettings, STORAGE_KEY } from '../settings';

describe('shouldLockOnResume', () => {
  const base = { enabled: true, lockAfterMs: 60_000, now: 1_000_000 };

  it('never locks when the lock is off', () => {
    expect(shouldLockOnResume({ ...base, enabled: false, backgroundedAt: null })).toBe(false);
  });

  it('locks on cold start', () => {
    expect(shouldLockOnResume({ ...base, backgroundedAt: null })).toBe(true);
  });

  it('respects the grace period', () => {
    expect(shouldLockOnResume({ ...base, backgroundedAt: base.now - 59_999 })).toBe(false);
    expect(shouldLockOnResume({ ...base, backgroundedAt: base.now - 60_000 })).toBe(true);
  });

  it('with no grace period, locks on every return', () => {
    expect(shouldLockOnResume({ ...base, lockAfterMs: 0, backgroundedAt: base.now })).toBe(true);
  });

  it('locks if the clock moved backwards', () => {
    expect(shouldLockOnResume({ ...base, backgroundedAt: base.now + 10_000 })).toBe(true);
  });
});

describe('canEnableLock', () => {
  it('allows passcode-only devices', () => {
    expect(canEnableLock({ hasHardware: false, enrolled: false, securityLevel: 1 })).toBe(true);
  });
  it('refuses a device with no passcode and no biometrics', () => {
    expect(canEnableLock({ hasHardware: true, enrolled: false, securityLevel: 0 })).toBe(false);
  });
});

describe('settings', () => {
  it('defaults hide the app-switcher preview but leave the lock off', () => {
    expect(parseSettings(null)).toEqual(DEFAULTS);
    expect(DEFAULTS.hideInSwitcher).toBe(true);
    expect(DEFAULTS.lockEnabled).toBe(false);
  });

  it('drops malformed values field by field', () => {
    expect(
      parseSettings(JSON.stringify({ lockEnabled: true, lockAfterMs: 12345, icon: 'Rainbow', quickExit: 'yes' })),
    ).toEqual({ ...DEFAULTS, lockEnabled: true });
    expect(parseSettings('{oops')).toEqual(DEFAULTS);
    expect(parseSettings('null')).toEqual(DEFAULTS);
  });

  it('persists updates and notifies', async () => {
    const data = new Map<string, string>();
    const store = createSettingsStore({
      getItemAsync: async (k) => data.get(k) ?? null,
      setItemAsync: async (k, v) => void data.set(k, v),
    });
    const fn = jest.fn();
    store.subscribe(fn);
    await store.load();
    await store.update({ icon: 'Ink', lockEnabled: true, lockAfterMs: 60_000 });
    expect(store.get()).toEqual({ ...DEFAULTS, icon: 'Ink', lockEnabled: true, lockAfterMs: 60_000 });
    expect(parseSettings(data.get(STORAGE_KEY)!)).toEqual(store.get());
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid update instead of storing it', async () => {
    const store = createSettingsStore({ getItemAsync: async () => null, setItemAsync: async () => {} });
    await store.load();
    await store.update({ lockAfterMs: 7 as never });
    expect(store.get().lockAfterMs).toBe(DEFAULTS.lockAfterMs);
  });
});
