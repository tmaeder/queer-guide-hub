import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { supabase } from '@/integrations/supabase/client';

/**
 * Metadata forwarded to `auth.users.raw_user_meta_data` at signup.
 *
 * Consent timestamps only. Everything else the profile needs is derived
 * server-side by `handle_new_user` (migration 20260915090000): display_name,
 * username and avatar are minted there, and signup_provider is read from
 * `raw_app_meta_data`, which GoTrue sets and a client cannot forge.
 *
 * The previous shape listed nine fields, most of which no trigger ever read —
 * `preferred_language` in particular had no column to land in, so the client
 * was writing it into the void. Anything added here needs a reader.
 */
interface SignUpMetadata {
  terms_accepted_at?: string;
  privacy_accepted_at?: string;
  age_confirmed_at?: string;
}

type OAuthProvider = 'google' | 'apple';

// Survives an in-SPA navigation between the recovery landing URL and
// /auth/reset-password. sessionStorage (not localStorage) so a recovery
// intent never outlives the tab that started it.
const RECOVERY_KEY = 'qg:auth:recovery';

function readStoredRecovery(): boolean {
  try {
    return window.sessionStorage.getItem(RECOVERY_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredRecovery(active: boolean) {
  try {
    if (active) window.sessionStorage.setItem(RECOVERY_KEY, '1');
    else window.sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* private mode — the in-memory flag still carries the current page */
  }
}

/**
 * True when this page load is a password-recovery landing.
 *
 * GoTrue's PKCE exchange deletes only `code` and the flow-id param from the
 * URL, so `?reset=1` (set by resetPassword's redirectTo) survives it. Reading
 * it synchronously covers the window before the PASSWORD_RECOVERY event lands:
 * the notification is dispatched behind a setTimeout(…, 0) while our
 * onAuthStateChange subscription registers in an effect, so the event is the
 * primary signal but not a guaranteed-first one.
 */
function detectInitialRecovery(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('reset') === '1') return true;
  } catch {
    /* no window.location in some test envs */
  }
  return readStoredRecovery();
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** A password-recovery link is being consumed; route to /auth/reset-password. */
  passwordRecovery: boolean;
  signUp: (
    email: string,
    password: string,
    metadata?: SignUpMetadata,
    captchaToken?: string,
  ) => Promise<{ error: unknown }>;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: unknown }>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: unknown }>;
  resetPassword: (email: string, captchaToken?: string) => Promise<{ error: unknown }>;
  updatePassword: (password: string) => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
  enrollPasskey: () => Promise<{ error: unknown }>;
  signInWithPasskey: () => Promise<{ error: unknown }>;
  hasPasskey: boolean;
}

// Exported so out-of-tree React roots (MapLibre popup content rendered via
// createRoot in usePopupManager) can bridge the app's auth context across the
// root boundary. Everything in-tree should keep using useAuth().
// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState<boolean>(detectInitialRecovery);
  // Whether a real PASSWORD_RECOVERY event has been seen this tab, as opposed
  // to the flag merely being seeded from ?reset=1. See the INITIAL_SESSION
  // branch below.
  const sawRecoveryEvent = useRef(false);

  // Persist a recovery detected from the URL so the flag survives the
  // client-side navigation to /auth/reset-password (which drops ?reset=1).
  useEffect(() => {
    if (passwordRecovery) writeStoredRecovery(true);
  }, [passwordRecovery]);

  useEffect(() => {
    // onAuthStateChange is the single source of truth for auth state.
    // It fires INITIAL_SESSION synchronously during setup with the
    // session from localStorage (or null if none). All subsequent
    // events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED) are also
    // delivered through this callback.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // A recovery link exchanges to PASSWORD_RECOVERY rather than SIGNED_IN
      // (auth-js tags the PKCE verifier with a '/recovery' suffix). Without
      // this branch the user is just silently signed in and bounced home,
      // which is why password reset never completed.
      if (event === 'PASSWORD_RECOVERY') {
        sawRecoveryEvent.current = true;
        setPasswordRecovery(true);
        writeStoredRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        sawRecoveryEvent.current = false;
        setPasswordRecovery(false);
        writeStoredRecovery(false);
      } else if (event === 'INITIAL_SESSION' && !sawRecoveryEvent.current) {
        // INITIAL_SESSION means the session was restored from storage rather
        // than minted by a recovery exchange (that path emits
        // PASSWORD_RECOVERY). So a flag still standing here came only from
        // the ?reset=1 seed — and anyone can put ?reset=1 on a URL. Clearing
        // it stops a crafted link from showing the set-a-new-password form
        // to an ordinary signed-in visitor.
        //
        // Gated on sawRecoveryEvent rather than on event order: auth-js
        // emits INITIAL_SESSION per-subscriber at registration time and
        // PASSWORD_RECOVERY from the URL exchange, and which lands first is
        // a race. This way both orders are correct — recovery-first is never
        // cleared, and initial-first is re-set when the real event arrives.
        setPasswordRecovery(false);
        writeStoredRecovery(false);
      }

      // Check for existing passkey enrollment when user signs in.
      // Pass the event's user id directly — the `user` state set above
      // has not flushed yet, so reading it inside the check would see the
      // previous (often null) value on first sign-in.
      if (session?.user) {
        // eslint-disable-next-line react-hooks/immutability -- checkPasskeyEnrollment declared below; auth callback fires after mount, after the binding is initialized.
        checkPasskeyEnrollment(session.user.id);
      } else {
        setHasPasskey(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Secure passkey enrollment check using database
  const checkPasskeyEnrollment = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_passkey_enrollment')
        .select('is_enrolled')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error checking passkey enrollment:', error);
        setHasPasskey(false);
      } else {
        setHasPasskey(data?.is_enrolled ?? false);
      }

      // Clean up any legacy localStorage entries
      try {
        localStorage.removeItem('hasPasskey');
        localStorage.removeItem(`passkey_enrolled_${userId}`);
      } catch (_e) {
        // Ignore localStorage errors
      }
    } catch (error) {
      console.error('Unexpected error checking passkey enrollment:', error);
      setHasPasskey(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    metadata?: SignUpMetadata,
    captchaToken?: string,
  ) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: metadata || {},
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    return { error };
  };

  const signInWithOAuth = async (provider: OAuthProvider) => {
    // Land on /auth/callback so the PKCE code is exchanged there and the
    // one-time "claim username" step can run for new OAuth users (whose
    // profiles.username starts NULL). Returning to "/" skips that step.
    const redirectUrl = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    return { error };
  };

  const resetPassword = async (email: string, captchaToken?: string) => {
    // Deliberately still /auth?reset=1, not /auth/reset-password: that is the
    // URL currently on the Supabase redirect allowlist, and RecoveryRedirect
    // forwards it. Repoint this only after adding the new URL in the dashboard
    // — otherwise GoTrue silently falls back to Site URL and the link lands
    // on "/", which is the original bug.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?reset=1`,
      ...(captchaToken ? { captchaToken } : {}),
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      setPasswordRecovery(false);
      writeStoredRecovery(false);
    }
    return { error };
  };

  const signIn = async (email: string, password: string, captchaToken?: string) => {
    try {
      // Add retry logic for auth requests
      let attempts = 0;
      const maxAttempts = 3;
      let authResult;

      while (attempts < maxAttempts) {
        try {
          authResult = await supabase.auth.signInWithPassword({
            email,
            password,
            ...(captchaToken ? { options: { captchaToken } } : {}),
          });
          break; // Success, exit retry loop
        } catch (networkError: unknown) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw networkError;
          }

          // Wait before retry (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        }
      }

      const { data, error } = authResult!;

      if (error) {
        console.error('Sign in error:', error);

        // Log failed sign-in attempt.
        // The email is deliberately NOT recorded: this row is written for an
        // unauthenticated caller who has just proved nothing, so the address
        // may well belong to someone who is not present — and on this platform
        // an address in a queryable log is identity-adjacent. Brute-force
        // detection belongs at the GoTrue rate limiter, which sees the real
        // identifier without persisting it here.
        try {
          await supabase.rpc('log_security_event', {
            p_event_type: 'FAILED_SIGNIN_ATTEMPT',
            p_user_id: null,
            p_metadata: {
              error_message: error.message,
              timestamp: new Date().toISOString(),
            },
            p_severity: 'medium',
          });
        } catch (logError) {
          console.error('Failed to log security event:', logError);
        }

        return { error };
      }

      // Log successful sign-in
      if (data.user) {
        try {
          await supabase.rpc('log_security_event', {
            p_event_type: 'SUCCESSFUL_SIGNIN',
            p_user_id: data.user.id,
            // p_user_id already identifies the account; the email would be
            // redundant PII in a log that outlives the session.
            p_metadata: {
              timestamp: new Date().toISOString(),
            },
            p_severity: 'info',
          });
        } catch (logError) {
          console.error('Failed to log security event:', logError);
        }
      }

      return { error };
    } catch (unexpectedError) {
      console.error('Unexpected sign-in error:', unexpectedError);
      return { error: { message: 'An unexpected error occurred during sign-in' } };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setHasPasskey(false);
    setPasswordRecovery(false);
    writeStoredRecovery(false);
  };

  // Helper function to check if running in iframe
  const isInIframe = () => {
    try {
      return window.self !== window.top;
    } catch (_e) {
      return true;
    }
  };

  const enrollPasskey = async () => {
    try {
      if (!user || !session) {
        throw new Error('User must be signed in to enroll passkey');
      }
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported on this device');
      }
      if (isInIframe()) {
        throw new Error(
          'Passkey setup is not available in preview mode. Please use the deployed app for passkey functionality.',
        );
      }

      // 1. Get registration options from the server.
      const { data: enrollData, error: enrollError } = await supabase.functions.invoke(
        'secure-passkey-operations',
        {
          body: { action: 'enroll' },
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (enrollError || !enrollData?.options) {
        throw new Error(enrollError?.message || 'Failed to initiate passkey enrollment');
      }

      // 2. Create the credential via the WebAuthn API.
      const regResponse = await startRegistration({ optionsJSON: enrollData.options });

      // 3. Verify + persist server-side (also sets the enrollment flag).
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        'secure-passkey-operations',
        {
          body: { action: 'verify-enrollment', credentialData: regResponse },
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (verifyError || !verifyData?.success) {
        throw new Error(
          verifyError?.message || verifyData?.error || 'Failed to verify passkey enrollment',
        );
      }

      setHasPasskey(true);
      return { error: null };
    } catch (error) {
      console.error('Passkey enrollment error:', error);
      return { error };
    }
  };

  const signInWithPasskey = async () => {
    try {
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported on this device');
      }
      if (isInIframe()) {
        throw new Error(
          'Passkey sign-in is not available in preview mode. Please use the deployed app for passkey functionality.',
        );
      }

      // 1. Get a discoverable-credential challenge (no session required —
      //    the browser surfaces the user's resident keys).
      const { data: authData, error: authError } = await supabase.functions.invoke(
        'secure-passkey-operations',
        { body: { action: 'authenticate' } },
      );
      if (authError || !authData?.options || !authData?.challengeId) {
        throw new Error(authError?.message || 'Failed to initiate passkey authentication');
      }

      // 2. Produce the assertion.
      const assertion = await startAuthentication({ optionsJSON: authData.options });

      // 3. Verify server-side and receive a one-time OTP to mint a session.
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        'secure-passkey-operations',
        {
          body: {
            action: 'verify-authentication',
            credentialData: assertion,
            challengeId: authData.challengeId,
          },
        },
      );
      if (verifyError || !verifyData?.success || !verifyData?.email || !verifyData?.otp) {
        throw new Error(
          verifyError?.message || verifyData?.error || 'Passkey authentication failed',
        );
      }

      // 4. Exchange the OTP for a real Supabase session. This fires
      //    onAuthStateChange (SIGNED_IN), which the provider listens to.
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: verifyData.email,
        token: verifyData.otp,
        type: 'email',
      });
      if (otpError) throw otpError;

      return { error: null };
    } catch (error) {
      console.error('Passkey sign-in error:', error);
      return { error };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        passwordRecovery,
        signUp,
        signIn,
        signInWithOAuth,
        resetPassword,
        updatePassword,
        signOut,
        enrollPasskey,
        signInWithPasskey,
        hasPasskey,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
