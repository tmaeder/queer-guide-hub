import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { invokeFunction } from '@/integrations/cloudflare-workers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TurnstileConfig {
  siteKey: string;
  version: string;
}

export function useSecureTurnstile() {
  const [config, setConfig] = useState<TurnstileConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchConfig = async () => {
    if (!user) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await invokeFunction('get-turnstile-config', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) {
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setConfig(data);
    } catch (err: any) {
      console.error('Failed to fetch Turnstile config:', err);
      const errorMessage = err.message || 'Failed to load captcha configuration';
      setError(errorMessage);
      
      if (err.message?.includes('Rate limit')) {
        toast({
          title: "Rate Limited",
          description: "Too many requests. Please wait a moment and try again.",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshConfig = () => {
    fetchConfig();
  };

  useEffect(() => {
    if (user) {
      fetchConfig();
    } else {
      setConfig(null);
      setLoading(false);
    }
  }, [user]);

  return {
    config,
    loading,
    error,
    refreshConfig,
    isConfigured: !!config?.siteKey
  };
}