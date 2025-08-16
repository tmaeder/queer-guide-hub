import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SecureCredentials {
  stripePublishableKey?: string;
  mapboxToken?: string;
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

      // Attempt to load credentials from secure edge functions
      const promises = [
        supabase.functions.invoke('get-stripe-publishable-key').catch(() => ({ data: null, error: null })),
        supabase.functions.invoke('secure-mapbox-token').catch(() => ({ data: null, error: null }))
      ];

      const [stripeResult, mapboxResult] = await Promise.all(promises);

      setCredentials({
        stripePublishableKey: stripeResult.data?.publishable_key || undefined,
        mapboxToken: mapboxResult.data?.token || undefined
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
    if (value && (
      (key === 'stripePublishableKey' && value.startsWith('pk_')) ||
      (key === 'mapboxToken' && value.startsWith('pk.'))
    )) {
      setCredentials(prev => ({ ...prev, [key]: value }));
    }
  };

  const clearCredentials = () => {
    setCredentials({});
    // Also clear any legacy localStorage items
    localStorage.removeItem('STRIPE_PUBLISHABLE_KEY');
    localStorage.removeItem('MAPBOX_TOKEN');
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