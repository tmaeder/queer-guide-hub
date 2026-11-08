import { nativePush } from '@/features/push/native';
import { forgetLocalRecord, unregisterBeforeSignOut } from '@/features/push/push';
import { supabase } from '@/lib/supabase';

/**
 * Account actions, mirroring the web's src/hooks/useAuth.tsx and
 * src/components/auth/Signup.tsx so a native account is the same account.
 *
 * Email code is the primary path, email + password secondary. Passkeys and OAuth need the
 * universal-link domain association first, so they come later.
 */
export const MIN_PASSWORD_LEN = 8;
export const WEB_ORIGIN = 'https://queer.guide';

export type AuthErrorKey =
  | 'invalidCredentials'
  | 'alreadyRegistered'
  | 'weakPassword'
  | 'rateLimited'
  | 'captcha'
  | 'otpInvalid'
  | 'noAccount'
  | 'network'
  | 'unknown';

/** Map a GoTrue / functions error onto a message key; never show raw server text. */
export function authErrorKey(err: unknown): AuthErrorKey {
  const e = err as { code?: string; status?: number; message?: string; name?: string } | null;
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'invalidCredentials';
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered'))
    return 'alreadyRegistered';
  if (code === 'weak_password' || msg.includes('password should')) return 'weakPassword';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || e?.status === 429)
    return 'rateLimited';
  // GoTrue answers a wrong AND an expired code with the same otp_expired.
  if (code === 'otp_expired' || msg.includes('token has expired or is invalid')) return 'otpInvalid';
  // shouldCreateUser:false on an unknown address.
  if (code === 'otp_disabled' || msg.includes('signups not allowed for otp')) return 'noAccount';
  if (code.startsWith('captcha') || msg.includes('captcha')) return 'captcha';
  if (e?.name === 'AuthRetryableFetchError' || msg.includes('network request failed') || msg.includes('fetch'))
    return 'network';
  return 'unknown';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(email: string, password: string): 'email' | 'password' | null {
  if (!EMAIL_RE.test(email.trim())) return 'email';
  if (password.length < MIN_PASSWORD_LEN) return 'password';
  return null;
}

export const OTP_LEN = 6;

export function validateEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** The consent metadata the web's Signup.tsx writes; one source for both flows. */
function consentData(consentedAt: Date) {
  const now = consentedAt.toISOString();
  return { terms_accepted_at: now, privacy_accepted_at: now, age_confirmed_at: now };
}

/**
 * Email-code sign-in. Accounts are only created when the caller passes a
 * consent moment: GoTrue applies `data` to new users only, so "sign in" with
 * shouldCreateUser:true would mint an account carrying consent nobody gave.
 */
export async function sendOtp(email: string, consentedAt?: Date) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: consentedAt
      ? { shouldCreateUser: true, data: consentData(consentedAt) }
      : { shouldCreateUser: false },
  });
  if (error) throw error;
}

export async function verifyOtp(email: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error) throw error;
}

export const RESET_REDIRECT = 'queerguide://auth?reset=1';

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: RESET_REDIRECT });
  if (error) throw error;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/**
 * Same metadata the web sends: only the consent timestamps. Username,
 * display name and avatar are minted by the database trigger; the client
 * never supplies them (an email-derived display name would look deliberate).
 */
export async function signUp(email: string, password: string, consentedAt = new Date()) {
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: consentData(consentedAt) },
  });
  if (error) throw error;
}

export async function signOut() {
  // While the session still exists: kill this phone's push token so the next
  // person to sign in here never receives this account's notifications.
  await unregisterBeforeSignOut(nativePush);
  // Local scope: signing out on this phone must not end sessions elsewhere.
  await supabase.auth.signOut({ scope: 'local' });
}

/**
 * The value the delete-account function checks the confirmation against:
 * the username when the profile has one, otherwise the account email. Read
 * through get_my_profile(), never a direct profiles select (column grants).
 */
export async function deletionConfirmationTarget(email: string | null | undefined): Promise<string> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) throw error;
  const username = Array.isArray(data) ? data[0]?.username : null;
  return (username ?? email ?? '').trim();
}

export function confirmationMatches(typed: string, expected: string) {
  return expected.length > 0 && typed.trim().toLowerCase() === expected.toLowerCase();
}

/**
 * Permanent erasure through the same edge function the web's Danger zone
 * uses (GDPR Art. 17 / nFADP). On success the session is dropped locally:
 * the auth user no longer exists, so there is nothing to revoke remotely.
 */
export async function deleteAccount(confirmation: string) {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { confirmation },
  });
  if (error) throw error;
  if (!(data as { success?: boolean } | null)?.success) throw new Error('Deletion failed');
  // The server already removed the token rows; kill the device token too.
  await nativePush.unregisterDevice().catch(() => {});
  await forgetLocalRecord().catch(() => {});
  await supabase.auth.signOut({ scope: 'local' });
}

/** The recovery link lands on queerguide://auth?code=…; PKCE turns it into a session. */
export async function exchangeRecoveryCode(code: string) {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
