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
    // Set up auth state listener FIRST
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

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        checkPasskeyEnrollment();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkPasskeyEnrollment = async () => {
    try {
      // Check localStorage for passkey enrollment status
      const storedPasskeyStatus = localStorage.getItem(`passkey_enrolled_${user?.id}`);
      setHasPasskey(storedPasskeyStatus === 'true');
    } catch (error) {
      console.error('Error checking passkey enrollment:', error);
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
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        console.error('Sign in error:', error);
        
        // Log failed sign-in attempt
        try {
          await supabase.rpc('log_enhanced_security_event', {
            event_type: 'FAILED_SIGNIN_ATTEMPT',
            user_id_param: null,
            details: {
              email: email,
              error_message: error.message,
              timestamp: new Date().toISOString()
            },
            severity: 'medium'
          });
        } catch (logError) {
          console.error('Failed to log security event:', logError);
        }
        
        return { error };
      }
      
      // Log successful sign-in
      if (data.user) {
        try {
          await supabase.rpc('log_enhanced_security_event', {
            event_type: 'SUCCESSFUL_SIGNIN',
            user_id_param: data.user.id,
            details: {
              email: email,
              timestamp: new Date().toISOString()
            },
            severity: 'info'
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

  const enrollPasskey = async () => {
    try {
      if (!user) {
        throw new Error('User must be signed in to enroll passkey');
      }

      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported on this device');
      }

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: {
          name: "The Queer Guide",
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email || '',
          displayName: user.email || '',
        },
        pubKeyCredParams: [
          {
            alg: -7, // ES256
            type: "public-key",
          },
          {
            alg: -257, // RS256
            type: "public-key",
          },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
        attestation: "direct",
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      }) as PublicKeyCredential;

      if (credential) {
        // Store passkey enrollment status
        localStorage.setItem(`passkey_enrolled_${user.id}`, 'true');
        localStorage.setItem(`passkey_credential_${user.id}`, credential.id);
        setHasPasskey(true);
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

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [],
        timeout: 60000,
        userVerification: "required",
      };

      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      }) as PublicKeyCredential;

      if (credential) {
        // For demonstration purposes, we'll show a success message
        // In a real implementation, you'd verify the credential on the server
        // and then sign the user in through Supabase
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