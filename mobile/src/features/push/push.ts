import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * Push token registry (plumbing only — nothing sends to these yet).
 *
 * Rules, all load-bearing on a platform where a notification can out someone:
 *   - Off by default. The OS permission prompt appears only when the user
 *     turns notifications on in Me → Notifications, never at launch.
 *   - A token is registered only while signed in, into the existing
 *     user_push_tokens table (RLS: owner only).
 *   - On sign-out the token is killed on the DEVICE (unregister, so APNs /
 *     FCM issue a new one and the old one stops delivering) and its row is
 *     deleted while the session still exists. The device step is what makes
 *     this hold offline: a row the server still has points at a dead
 *     token, so the previous user's notifications can never reach whoever
 *     signs in on this phone next. Sign-out itself never waits on the
 *     network — handing the phone over must always work.
 *   - The native device token (APNs / FCM) is stored, not an Expo push
 *     token, so no third-party relay sees who is registered.
 */
const KEY = 'qg.push.v1';

export interface PushRecord {
  userId: string;
  token: string;
}

export interface PushDeps {
  requestPermission(): Promise<boolean>;
  getDeviceToken(): Promise<string>;
  /** Invalidate this device's token at APNs / FCM. */
  unregisterDevice(): Promise<void>;
}

export type PushPlatform = 'ios' | 'android';

export async function readRecord(): Promise<PushRecord | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as PushRecord;
    return r.userId && r.token ? r : null;
  } catch {
    return null;
  }
}

async function writeRecord(r: PushRecord | null) {
  if (r) {
    await SecureStore.setItemAsync(KEY, JSON.stringify(r), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
}

export type EnableResult = 'enabled' | 'denied' | 'unavailable';

export async function enablePush(
  userId: string,
  deps: PushDeps,
  platform: PushPlatform = Platform.OS === 'ios' ? 'ios' : 'android',
): Promise<EnableResult> {
  if (!(await deps.requestPermission())) return 'denied';
  let token: string;
  try {
    token = await deps.getDeviceToken();
  } catch {
    // e.g. Android build without Firebase config, or a simulator.
    return 'unavailable';
  }
  const prev = await readRecord();
  if (prev && prev.token !== token) await removeTokenRow(prev.token);
  const { error } = await supabase
    .from('user_push_tokens')
    .upsert({ user_id: userId, token, platform, updated_at: new Date().toISOString() }, { onConflict: 'user_id,token' });
  if (error) throw error;
  await writeRecord({ userId, token });
  return 'enabled';
}

async function removeTokenRow(token: string) {
  const { error } = await supabase.from('user_push_tokens').delete().eq('token', token);
  if (error) throw error;
}

/** Turn notifications off for this phone. Safe to call when nothing is registered. */
export async function disablePush(deps: Pick<PushDeps, 'unregisterDevice'>) {
  const rec = await readRecord();
  if (!rec) return;
  await removeTokenRow(rec.token);
  await deps.unregisterDevice().catch(() => {});
  await writeRecord(null);
}

/**
 * Run before a sign-out, while the session still exists. Never throws: the
 * device-side unregister is what guarantees the old token is dead; the row
 * delete is tidy-up that may fail offline.
 */
export async function unregisterBeforeSignOut(deps: Pick<PushDeps, 'unregisterDevice'>) {
  const rec = await readRecord().catch(() => null);
  if (!rec) return;
  await deps.unregisterDevice().catch(() => {});
  await removeTokenRow(rec.token).catch(() => {});
  await writeRecord(null).catch(() => {});
}

/** After account deletion the server already removed the rows; forget locally. */
export async function forgetLocalRecord() {
  await writeRecord(null);
}

/**
 * A session can also end without the user tapping Sign out (refresh token
 * revoked or expired). The row can no longer be deleted then, but the
 * device token can still be killed, which is the part that protects the
 * next person.
 */
export function unregisterOnSessionEnd(deps: Pick<PushDeps, 'unregisterDevice'>) {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') void unregisterBeforeSignOut(deps);
  });
  return () => data.subscription.unsubscribe();
}
