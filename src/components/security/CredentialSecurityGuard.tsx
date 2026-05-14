import React, { createContext, useContext, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface SecureCredentials {
  stripePublishableKey?: string;
}

interface CredentialContextType {
  credentials: SecureCredentials;
  loading: boolean;
  error: string | null;
  clearCredentials: () => void;
}

const CredentialContext = createContext<CredentialContextType | undefined>(undefined);

interface CredentialSecurityGuardProps {
  children: React.ReactNode;
}

/**
 * CredentialSecurityGuard - Secure credential management component
 * Prevents client-side credential storage and enforces secure access patterns
 */
export function CredentialSecurityGuard({ children }: CredentialSecurityGuardProps) {
  const [credentials, setCredentials] = useState<SecureCredentials>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Clear any legacy localStorage credentials on initialization
    const legacyKeys = [
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_SECRET_KEY', // This should never exist client-side but clear just in case
      'API_KEY',
      'SECRET_KEY'
    ];

    legacyKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.warn(`Removed insecure credential storage: ${key}`);
      }
    });

    // Monitor for unauthorized credential storage attempts
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key: string, value: string) {
      if (key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN')) {
        console.error(`Blocked insecure credential storage attempt: ${key}`);
        toast({
          title: "Security Warning",
          description: "Attempted to store credentials insecurely. This has been blocked.",
          variant: "destructive"
        });
        return;
      }
      return originalSetItem.call(this, key, value);
    };

    setLoading(false);
  }, [toast]);

  const clearCredentials = () => {
    setCredentials({});
    setError(null);
  };

  const contextValue: CredentialContextType = {
    credentials,
    loading,
    error,
    clearCredentials
  };

  return (
    <CredentialContext.Provider value={contextValue}>
      {children}
    </CredentialContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSecureCredentials() {
  const context = useContext(CredentialContext);
  if (context === undefined) {
    throw new Error('useSecureCredentials must be used within a CredentialSecurityGuard');
  }
  return context;
}