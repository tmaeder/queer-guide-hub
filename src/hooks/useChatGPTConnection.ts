import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

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
    } catch (error: any) {
      console.error('Error fetching ChatGPT status:', error);
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('chatgpt-oauth', {
        body: { action: 'authorize' },
      });

      if (error) throw error;

      if (data?.authorization_url) {
        // Open OAuth flow in a popup window
        const popup = window.open(
          data.authorization_url,
          'chatgpt-oauth',
          'width=600,height=700,scrollbars=yes',
        );

        // Poll for popup closure and refresh status
        const pollInterval = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(pollInterval);
            fetchStatus();
          }
        }, 1000);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to get authorization URL',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error initiating ChatGPT OAuth:', error);
      toast({
        title: 'Connection Error',
        description: error.message || 'Failed to start ChatGPT connection',
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
    } catch (error: any) {
      console.error('Error disconnecting ChatGPT:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to disconnect ChatGPT',
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
    } catch (error: any) {
      console.error('Error testing ChatGPT connection:', error);
      toast({
        title: 'Test Failed',
        description: error.message || 'Failed to test ChatGPT connection',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  }, [toast]);

  useEffect(() => {
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
