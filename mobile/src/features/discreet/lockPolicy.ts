/**
 * When the app lock applies. Pure, so the rules are tested without a device.
 *
 * - Cold start with the lock on: locked.
 * - Returning from the background: locked once the grace period has passed.
 * - `lockAfterMs = 0` means "every time you leave".
 * - A clock that moved backwards (manual change, timezone travel) locks,
 *   rather than letting a negative elapsed time stay unlocked forever.
 */
export function shouldLockOnResume(opts: {
  enabled: boolean;
  lockAfterMs: number;
  backgroundedAt: number | null;
  now: number;
}): boolean {
  const { enabled, lockAfterMs, backgroundedAt, now } = opts;
  if (!enabled) return false;
  if (backgroundedAt == null) return true;
  const elapsed = now - backgroundedAt;
  if (elapsed < 0) return true;
  return elapsed >= lockAfterMs;
}

/**
 * Whether the device can authenticate at all. The lock may only be turned on
 * when this is true; otherwise someone could lock themselves out.
 * `hasPasscodeFallback` is true because authenticateAsync falls back to the
 * device passcode, so biometrics are not required.
 */
export function canEnableLock(caps: { hasHardware: boolean; enrolled: boolean; securityLevel: number }): boolean {
  // expo-local-authentication SecurityLevel: 0 NONE, 1 SECRET (passcode), 2 BIOMETRIC_WEAK, 3 BIOMETRIC_STRONG
  return caps.securityLevel > 0 || (caps.hasHardware && caps.enrolled);
}
