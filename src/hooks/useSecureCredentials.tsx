import { useState, useEffect } from 'react';
import { api } from '@/integrations/api/client';

interface SecureCredentials {
  stripePublishableKey?: string;
}

/**
 * useSecureCredentials - Secure credential management hook
 * Replaces localStorage storage with secure edge function retrieval
 */
export function useSecureCredentials() {
  const [credentials, setCredentials] = useState<SecureCredentials>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSecureCredentials();
  }, []);

  const loadSecureCredentials = async () => {
    try {
      setLoading(true);
      setError(null);

      const stripeResult = await api.functions.invoke('get-stripe-publishable-key').catch(() => ({ data: null, error: null }));

      setCredentials({
        stripePublishableKey: stripeResult.data?.publishable_key || undefined,
      });

    } catch (err) {
      console.error('Failed to load secure credentials:', err);
      setError('Failed to load secure credentials');
    } finally {
      setLoading(false);
    }
  };

  const setTemporaryCredential = (key: keyof SecureCredentials, value: string) => {
    // Only allow setting for current session, no persistence
    if (value && key === 'stripePublishableKey' && value.startsWith('pk_')) {
      setCredentials(prev => ({ ...prev, [key]: value }));
    }
  };

  const clearCredentials = () => {
    setCredentials({});
    // Also clear any legacy localStorage items
    localStorage.removeItem('STRIPE_PUBLISHABLE_KEY');
  };

  return {
    credentials,
    loading,
    error,
    setTemporaryCredential,
    clearCredentials,
    refetch: loadSecureCredentials
  };
}
