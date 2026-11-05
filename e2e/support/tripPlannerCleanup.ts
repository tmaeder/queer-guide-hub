import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

export const TRIP_PROJECT = 'xqeacpakadqfxjxjcewc';
export const TRIP_SUPABASE_URL = `https://${TRIP_PROJECT}.supabase.co`;
export const tripAuthOptions = { persistSession: false, autoRefreshToken: false };

export interface DisposableTripAccount {
  id: string;
  email: string;
}

export function tripFixtureAdmin() {
  if (process.env.TRIP_E2E_PRODUCTION !== '1') {
    throw new Error('Set TRIP_E2E_PRODUCTION=1 to run the disposable-account suite on queer.guide');
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for fixture setup and cleanup');
  return createClient(TRIP_SUPABASE_URL, key, { auth: tripAuthOptions });
}

export function recordTripAccount(account: DisposableTripAccount) {
  const file = process.env.TRIP_E2E_CLEANUP_FILE;
  if (file) appendFileSync(file, JSON.stringify(account) + '\n', { mode: 0o600 });
}

export async function cleanupTripAccounts(
  admin: ReturnType<typeof tripFixtureAdmin>,
  accounts: DisposableTripAccount[],
) {
  const errors: unknown[] = [];
  for (const { id, email } of accounts) {
    try {
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) ||
        !/^trip-qa-(owner|viewer)-[a-f0-9]{12}@example\.test$/.test(email)
      ) {
        throw new Error('Invalid disposable trip account record');
      }
      const account = await admin.auth.admin.getUserById(id);
      if (account.error?.status === 404) continue;
      if (account.error || account.data.user?.email !== email) {
        throw new Error('Could not verify ownership of the disposable account');
      }

      // Removing the trip cascades to days, stops, invitations, and shares.
      // Delete reservations first since they may otherwise become unattached.
      for (const [table, field] of [
        ['reservations', 'user_id'],
        ['trips', 'owner_id'],
      ] as const) {
        const removed = await admin.from(table).delete().eq(field, id);
        if (removed.error) throw new Error(`Could not delete disposable ${table}`);
        const remaining = await admin
          .from(table)
          .select('id', { head: true, count: 'exact' })
          .eq(field, id);
        if (remaining.error || remaining.count !== 0) {
          throw new Error(`Could not verify cleanup of disposable ${table}`);
        }
      }
      const removed = await admin.auth.admin.deleteUser(id);
      if (removed.error && removed.error.status !== 404)
        throw new Error('Could not delete disposable account');
      const remaining = await admin.auth.admin.getUserById(id);
      if (remaining.error?.status !== 404)
        throw new Error('Could not verify disposable account deletion');
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Trip regression cleanup failed');
}

export async function cleanupRecordedTripAccounts() {
  const file = process.env.TRIP_E2E_CLEANUP_FILE;
  if (!file || !existsSync(file)) return;
  const accounts = readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DisposableTripAccount);
  await cleanupTripAccounts(tripFixtureAdmin(), accounts);
}
