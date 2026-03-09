import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/integrations/api/client';

interface SignUpMetadata {
  display_name?: string;
  first_name?: string;
  last_name?: string;
  location?: string;
  age_range?: string;
  pronouns?: string;
  gender_identity?: string;
  looking_for?: string[];
  bio?: string;
  avatar_url?: string;
  avatar_config?: any;
}

interface User {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
}

interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, metadata?: SignUpMetadata) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  enrollPasskey: () => Promise<{ error: any }>;
  signInWithPasskey: () => Promise<{ error: any }>;
  hasPasskey: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPasskey, setHasPasskey] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = api.auth.onAuthStateChange((_event, session) => {
      setSession(session as Session | null);
      if (session) {
        api.auth.getUser().then(({ data }) => {
          setUser((data as any)?.user ?? null);
          setLoading(false);
        });
        checkPasskeyEnrollment();
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkPasskeyEnrollment = async () => {
    if (!user) {
      setHasPasskey(false);
      return;
    }

    try {
      const { data, error } = await api
        .from('user_passkey_enrollment')
        .select('is_enrolled')
        .eq('user_id', user.id)
        .single();

      if (error && (error as any).code !== 'PGRST116') {
        console.error('Error checking passkey enrollment:', error);
        setHasPasskey(false);
      } else {
        setHasPasskey((data as any)?.is_enrolled ?? false);
      }
    } catch (error) {
      console.error('Unexpected error checking passkey enrollment:', error);
      setHasPasskey(false);
    }
  };

  const signUp = async (email: string, password: string, metadata?: SignUpMetadata) => {
    const redirectUrl = `${window.location.origin}/`;

    const { error } = await api.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: metadata || {},
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    try {
      let attempts = 0;
      const maxAttempts = 3;
      let authResult: any;

      while (attempts < maxAttempts) {
        try {
          authResult = await api.auth.signInWithPassword({ email, password });
          break;
        } catch (networkError: any) {
          attempts++;
          if (attempts >= maxAttempts) throw networkError;
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        }
      }

      const { data, error } = authResult!;

      if (error) {
        console.error('Sign in error:', error);

        try {
          await api.rpc('log_security_event', {
            p_event_type: 'FAILED_SIGNIN_ATTEMPT',
            p_user_id: null,
            p_metadata: {
              email,
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

      if (data?.user) {
        try {
          await api.rpc('log_security_event', {
            p_event_type: 'SUCCESSFUL_SIGNIN',
            p_user_id: data.user.id,
            p_metadata: {
              email,
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
    await api.auth.signOut();
    setHasPasskey(false);
  };

  const isInIframe = () => {
    try {
      return window.self !== window.top;
    } catch {
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

      const { data: enrollData, error: enrollError } = await api.functions.invoke(
        'secure-passkey-operations',
        {
          body: { action: 'enroll' },
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (enrollError || !(enrollData as any)?.publicKeyCredentialCreationOptions) {
        throw new Error((enrollError as any)?.message || 'Failed to initiate passkey enrollment');
      }

      const options = (enrollData as any).publicKeyCredentialCreationOptions;
      options.challenge = new Uint8Array(options.challenge);
      options.user.id = new Uint8Array(options.user.id);

      const credential = (await navigator.credentials.create({
        publicKey: options,
      })) as PublicKeyCredential;

      if (credential) {
        const { data: verifyData, error: verifyError } = await api.functions.invoke(
          'secure-passkey-operations',
          {
            body: {
              action: 'verify-enrollment',
              credentialData: {
                id: credential.id,
                response: { publicKey: credential.response, counter: 0 },
                type: credential.type,
              },
            },
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        );

        if (verifyError || !(verifyData as any)?.success) {
          throw new Error((verifyError as any)?.message || 'Failed to verify passkey enrollment');
        }

        try {
          const { error: enrollmentError } = await api.from('user_passkey_enrollment').upsert({
            user_id: user.id,
            is_enrolled: true,
            enrolled_at: new Date().toISOString(),
            device_name: 'WebAuthn Device',
            updated_at: new Date().toISOString(),
          });

          if (enrollmentError) {
            console.error('Error storing passkey enrollment:', enrollmentError);
          } else {
            setHasPasskey(true);
          }
        } catch (error) {
          console.error('Error updating passkey enrollment status:', error);
        }

        return { error: null };
      }

      throw new Error('Failed to create passkey');
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

      if (!session) {
        throw new Error('User session required for passkey authentication');
      }

      const { data: authData, error: authError } = await api.functions.invoke(
        'secure-passkey-operations',
        {
          body: { action: 'authenticate' },
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (authError || !(authData as any)?.publicKeyCredentialRequestOptions) {
        throw new Error((authError as any)?.message || 'Failed to initiate passkey authentication');
      }

      const options = (authData as any).publicKeyCredentialRequestOptions;
      options.challenge = new Uint8Array(options.challenge);

      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((cred: any) => ({
          ...cred,
          id: typeof cred.id === 'string' ? new TextEncoder().encode(cred.id) : cred.id,
        }));
      }

      const credential = (await navigator.credentials.get({
        publicKey: options,
      })) as PublicKeyCredential;

      if (credential) {
        return { error: null };
      }

      throw new Error('Failed to authenticate with passkey');
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
        signUp,
        signIn,
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
