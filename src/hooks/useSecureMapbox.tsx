import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

        // Call secure edge function to get Mapbox token (public)
        const { data, error } = await supabase.functions.invoke('secure-mapbox-token');

        if (error) {
          throw error;
        }

        if (!data?.token) {
          throw new Error('No token received');
        }

        setToken(data.token);
      } catch (err: any) {
        console.error('Failed to fetch Mapbox token:', err);
        setError(err.message || 'Failed to fetch map token');
        
          // Fallback: use a locally stored public token if available
          const localToken = typeof window !== 'undefined' ? localStorage.getItem('mapbox_public_token') : null;
          if (localToken) {
            setToken(localToken);
            console.warn('Using local Mapbox public token fallback');
            return;
          }

          toast({
            title: "Map Loading Error",
            description: "Unable to load map functionality. Please try again soon.",
            variant: "destructive"
          });
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