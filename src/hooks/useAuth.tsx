import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { supabase } from '@/integrations/supabase/client';

interface SignUpMetadata {
  display_name?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  location?: string;
  pronouns?: string;
  preferred_language?: string;
  looking_for?: string[];
  interests?: string[];
  terms_accepted_at?: string;
  privacy_accepted_at?: string;
  age_confirmed_at?: string;
}

type OAuthProvider = 'google' | 'apple';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, metadata?: SignUpMetadata) => Promise<{ error: unknown }>;
  signIn: (email: string, password: string) => Promise<{ error: unknown }>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: unknown }>;
  resendVerification: (email: string) => Promise<{ error: unknown }>;
  resetPassword: (email: string) => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
  enrollPasskey: () => Promise<{ error: unknown }>;
  signInWithPasskey: () => Promise<{ error: unknown }>;
  hasPasskey: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPasskey, setHasPasskey] = useState(false);

  useEffect(() => {
    // onAuthStateChange is the single source of truth for auth state.
    // It fires INITIAL_SESSION synchronously during setup with the
    // session from localStorage (or null if none). All subsequent
    // events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED) are also
    // delivered through this callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

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
      }
    );

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


  const signUp = async (email: string, password: string, metadata?: SignUpMetadata) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: metadata || {},
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

  const resendVerification = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?reset=1`,
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
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
          });
          break; // Success, exit retry loop
        } catch (networkError: unknown) {
          attempts++;
          if (attempts >= maxAttempts) {
            throw networkError;
          }
          
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        }
      }
      
      const { data, error } = authResult!;
      
      if (error) {
        console.error('Sign in error:', error);
        
        // Log failed sign-in attempt
        try {
          await supabase.rpc('log_security_event', {
            p_event_type: 'FAILED_SIGNIN_ATTEMPT',
            p_user_id: null,
            p_metadata: {
              email: email,
              error_message: error.message,
              timestamp: new Date().toISOString()
            },
            p_severity: 'medium'
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
            p_metadata: {
              email: email,
              timestamp: new Date().toISOString()
            },
            p_severity: 'info'
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
        throw new Error('Passkey setup is not available in preview mode. Please use the deployed app for passkey functionality.');
      }

      // 1. Get registration options from the server.
      const { data: enrollData, error: enrollError } = await supabase.functions.invoke(
        'secure-passkey-operations',
        {
          body: { action: 'enroll' },
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
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
        }
      );
      if (verifyError || !verifyData?.success) {
        throw new Error(verifyError?.message || verifyData?.error || 'Failed to verify passkey enrollment');
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
        throw new Error('Passkey sign-in is not available in preview mode. Please use the deployed app for passkey functionality.');
      }

      // 1. Get a discoverable-credential challenge (no session required —
      //    the browser surfaces the user's resident keys).
      const { data: authData, error: authError } = await supabase.functions.invoke(
        'secure-passkey-operations',
        { body: { action: 'authenticate' } }
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
        }
      );
      if (verifyError || !verifyData?.success || !verifyData?.email || !verifyData?.otp) {
        throw new Error(verifyError?.message || verifyData?.error || 'Passkey authentication failed');
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
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signUp,
      signIn,
      signInWithOAuth,
      resendVerification,
      resetPassword,
      signOut,
      enrollPasskey,
      signInWithPasskey,
      hasPasskey,
    }}>
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