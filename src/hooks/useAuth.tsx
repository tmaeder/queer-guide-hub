import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

        // Check for existing passkey enrollment when user signs in
        if (session?.user) {
          checkPasskeyEnrollment();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Secure passkey enrollment check using database
  const checkPasskeyEnrollment = async () => {
    if (!user) {
      setHasPasskey(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_passkey_enrollment')
        .select('is_enrolled')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error is okay
        console.error('Error checking passkey enrollment:', error);
        setHasPasskey(false);
      } else {
        setHasPasskey(data?.is_enrolled ?? false);
      }
      
      // Clean up any legacy localStorage entries
      try {
        localStorage.removeItem('hasPasskey');
        localStorage.removeItem(`passkey_enrolled_${user.id}`);
      } catch (e) {
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
        data: metadata || {}
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    try {
      // Log security event for sign-in attempt
      console.log('Sign-in attempt for email:', email);
      
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
        } catch (networkError: any) {
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
    } catch (e) {
      return true;
    }
  };

  const enrollPasskey = async () => {
    try {
      if (!user || !session) {
        throw new Error('User must be signed in to enroll passkey');
      }

      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported on this device');
      }

      // Check if running in iframe (like preview environment)
      if (isInIframe()) {
        throw new Error('Passkey setup is not available in preview mode. Please use the deployed app for passkey functionality.');
      }

      // Call secure edge function to get challenge and options
      const { data: enrollData, error: enrollError } = await supabase.functions.invoke(
        'secure-passkey-operations',
        {
          body: { action: 'enroll' },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (enrollError || !enrollData?.publicKeyCredentialCreationOptions) {
        throw new Error(enrollError?.message || 'Failed to initiate passkey enrollment');
      }

      // Convert challenge back to Uint8Array
      const options = enrollData.publicKeyCredentialCreationOptions;
      options.challenge = new Uint8Array(options.challenge);
      options.user.id = new Uint8Array(options.user.id);

      const credential = await navigator.credentials.create({
        publicKey: options,
      }) as PublicKeyCredential;

      if (credential) {
        // Verify enrollment with server
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
          'secure-passkey-operations',
          {
            body: { 
              action: 'verify-enrollment',
              credentialData: {
                id: credential.id,
                response: {
                  publicKey: credential.response,
                  counter: 0
                },
                type: credential.type
              }
            },
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (verifyError || !verifyData?.success) {
          throw new Error(verifyError?.message || 'Failed to verify passkey enrollment');
        }

        // Store passkey enrollment status securely in database
        try {
          const { error: enrollmentError } = await supabase
            .from('user_passkey_enrollment')
            .upsert({
              user_id: user.id,
              is_enrolled: true,
              enrolled_at: new Date().toISOString(),
              device_name: 'WebAuthn Device',
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

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
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported on this device');
      }

      // Check if running in iframe (like preview environment)
      if (isInIframe()) {
        throw new Error('Passkey sign-in is not available in preview mode. Please use the deployed app for passkey functionality.');
      }

      // Note: For sign-in, we would need to identify the user first
      // This is a simplified implementation for demonstration
      if (!session) {
        throw new Error('User session required for passkey authentication');
      }

      // Call secure edge function to get authentication challenge
      const { data: authData, error: authError } = await supabase.functions.invoke(
        'secure-passkey-operations',
        {
          body: { action: 'authenticate' },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (authError || !authData?.publicKeyCredentialRequestOptions) {
        throw new Error(authError?.message || 'Failed to initiate passkey authentication');
      }

      // Convert challenge back to Uint8Array
      const options = authData.publicKeyCredentialRequestOptions;
      options.challenge = new Uint8Array(options.challenge);
      
      // Convert allowCredentials IDs if needed
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((cred: any) => ({
          ...cred,
          id: typeof cred.id === 'string' ? new TextEncoder().encode(cred.id) : cred.id
        }));
      }

      const credential = await navigator.credentials.get({
        publicKey: options,
      }) as PublicKeyCredential;

      if (credential) {
        // In a full implementation, you would verify the assertion on the server
        // and then complete the sign-in process
        return { error: null };
      }
      
      throw new Error('Failed to authenticate with passkey');
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
      signOut,
      enrollPasskey,
      signInWithPasskey,
      hasPasskey,
      
    }}>
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