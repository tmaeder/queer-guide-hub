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

        // Get current session to ensure we have auth token
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          throw new Error('Authentication required');
        }

        // Call secure edge function to get Mapbox token
        const { data, error } = await supabase.functions.invoke('secure-mapbox-token', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

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
        
        // Only show toast for non-auth errors to avoid spam
        if (!err.message?.includes('Authentication')) {
          toast({
            title: "Map Loading Error",
            description: "Unable to load map functionality. Please try again.",
            variant: "destructive"
          });
        }
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