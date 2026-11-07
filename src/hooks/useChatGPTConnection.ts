import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { openPendingWindow } from '@/lib/openPendingWindow';

export interface ChatGPTConnectionStatus {
  connected: boolean;
  expires_at?: string;
  has_refresh_token?: boolean;
  organization_id?: string;
  fallback_available?: boolean;
  using_fallback?: boolean;
}

export function useChatGPTConnection() {
  const [status, setStatus] = useState<ChatGPTConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('chatgpt-oauth', {
        body: { action: 'status' },
      });

      if (error) throw error;
      setStatus(data);
    } catch (error: unknown) {
      console.error('Error fetching ChatGPT status:', error);
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async () => {
    // Open the popup now, inside the click: Safari blocks a window.open() that
    // runs after the await below, because the click's user activation is gone.
    const pending = openPendingWindow('chatgpt-oauth', 'width=600,height=700,scrollbars=yes');
    try {
      const { data, error } = await supabase.functions.invoke('chatgpt-oauth', {
        body: { action: 'authorize' },
      });

      if (error) throw error;

      if (data?.authorization_url) {
        if (!pending.navigate(data.authorization_url)) {
          toast({
            title: 'Popup blocked',
            description: 'Allow popups for this site to connect ChatGPT, then try again.',
            variant: 'destructive',
          });
          return;
        }
        const popup = pending.window;

        // Poll for popup closure and refresh status
        const pollInterval = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(pollInterval);
            fetchStatus();
          }
        }, 1000);
      } else {
        pending.close();
        toast({
          title: 'Error',
          description: 'Failed to get authorization URL',
          variant: 'destructive',
        });
      }
    } catch (error: unknown) {
      pending.close();
      console.error('Error initiating ChatGPT OAuth:', error);
      toast({
        title: 'Connection Error',
        description: error instanceof Error ? error.message : 'Failed to start ChatGPT connection',
        variant: 'destructive',
      });
    }
  }, [fetchStatus, toast]);

  const disconnect = useCallback(async () => {
    try {
      const { error } = await supabase.functions.invoke('chatgpt-oauth', {
        body: { action: 'disconnect' },
      });

      if (error) throw error;

      setStatus({ connected: false });
      toast({
        title: 'Disconnected',
        description: 'ChatGPT has been disconnected successfully',
      });
    } catch (error: unknown) {
      console.error('Error disconnecting ChatGPT:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to disconnect ChatGPT',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const testConnection = useCallback(async () => {
    try {
      setTesting(true);
      const { data, error } = await supabase.functions.invoke('chatgpt-oauth', {
        body: { action: 'test' },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Connection Verified',
          description: `ChatGPT is working. Models available: ${data.models_count || 'unknown'}`,
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: data?.error || 'ChatGPT test failed',
          variant: 'destructive',
        });
      }
    } catch (error: unknown) {
      console.error('Error testing ChatGPT connection:', error);
      toast({
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Failed to test ChatGPT connection',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    testing,
    connect,
    disconnect,
    testConnection,
    refresh: fetchStatus,
  };
}
