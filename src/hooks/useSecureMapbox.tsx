import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// In-memory deduplication and cache (prevents rate-limit spikes)
let mapboxTokenCache: { token: string; expiresAt: number } | null = null;
let mapboxTokenInflight: Promise<string> | null = null;

// Cache for 12 hours (public tokens rarely change)
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function useSecureMapbox() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchToken = async () => {
      try {
        setLoading(true);
        setError(null);

        const now = Date.now();

        // 1) Memory cache
        if (mapboxTokenCache && mapboxTokenCache.expiresAt > now) {
          setToken(mapboxTokenCache.token);
          return;
        }

        // 2) LocalStorage cache
        const lsItem = typeof window !== 'undefined' ? localStorage.getItem('mapbox_cached_token') : null;
        if (lsItem) {
          try {
            const parsed = JSON.parse(lsItem) as { token: string; expiresAt: number };
            if (parsed?.token && parsed.expiresAt > now) {
              mapboxTokenCache = parsed;
              setToken(parsed.token);
              return;
            }
          } catch {}
        }

        // 3) De-duplicated network call with retry logic
        if (!mapboxTokenInflight) {
          mapboxTokenInflight = (async () => {
            let attempts = 0;
            const maxAttempts = 3;
            
            while (attempts < maxAttempts) {
              try {
                const { data, error } = await supabase.functions.invoke('secure-mapbox-token');
                if (error) throw error;
                if (!data?.token) throw new Error('No token received');
                return data.token as string;
              } catch (err: any) {
                attempts++;
                if (attempts >= maxAttempts) throw err;
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
              }
            }
            throw new Error('Max retry attempts reached');
          })().finally(() => {
            mapboxTokenInflight = null;
          });
        }

        const freshToken = await mapboxTokenInflight;

        // Save to memory and localStorage
        mapboxTokenCache = { token: freshToken, expiresAt: now + CACHE_TTL_MS };
        if (typeof window !== 'undefined') {
          localStorage.setItem('mapbox_cached_token', JSON.stringify(mapboxTokenCache));
          // Keep legacy fallback aligned
          localStorage.setItem('mapbox_public_token', freshToken);
        }

        setToken(freshToken);
      } catch (err: any) {
        console.error('Failed to fetch Mapbox token:', err);
        setError(err?.message || 'Failed to fetch map token');

        // Try stale cached token (even if expired)
        try {
          const lsItem = typeof window !== 'undefined' ? localStorage.getItem('mapbox_cached_token') : null;
          if (lsItem) {
            const parsed = JSON.parse(lsItem) as { token: string; expiresAt: number };
            if (parsed?.token) {
              setToken(parsed.token);
              console.warn('Using stale cached Mapbox token fallback');
              return;
            }
          }
        } catch {}

        // No hardcoded fallback — map will show error state
        console.warn('All Mapbox token sources exhausted');
        return;
      } finally {
        setLoading(false);
      }
    };

    fetchToken();
  }, [toast]);

  return {
    token,
    loading,
    error,
    isAuthenticated: !!token
  };
}