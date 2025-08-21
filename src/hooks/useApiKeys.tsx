import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

export interface ApiKey {
  id: string;
  service_name: string;
  key_name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at?: string;
}

export interface CreateApiKeyRequest {
  service_name: string;
  key_name: string;
  key_value: string;
  description?: string;
}

export interface UpdateApiKeyRequest {
  service_name?: string;
  key_name?: string;
  key_value?: string;
  description?: string;
  is_active?: boolean;
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'GET'
      });

      if (error) throw error;

      setKeys(data.keys || []);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast({
        title: "Error",
        description: "Failed to load API keys",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async (keyData: CreateApiKeyRequest) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'POST',
        body: keyData
      });

      if (error) throw error;

      await loadApiKeys(); // Refresh the list
      toast({
        title: "Success",
        description: "API key created successfully",
      });

      return data.key;
    } catch (error: any) {
      console.error('Error creating API key:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create API key",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateApiKey = async (id: string, updateData: UpdateApiKeyRequest) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'PUT',
        body: { ...updateData, id }
      });

      if (error) throw error;

      await loadApiKeys(); // Refresh the list
      toast({
        title: "Success",
        description: "API key updated successfully",
      });

      return data.key;
    } catch (error: any) {
      console.error('Error updating API key:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update API key",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteApiKey = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'DELETE',
        body: { id }
      });

      if (error) throw error;

      await loadApiKeys(); // Refresh the list
      toast({
        title: "Success",
        description: "API key deleted successfully",
      });
    } catch (error: any) {
      console.error('Error deleting API key:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete API key",
        variant: "destructive",
      });
      throw error;
    }
  };

  const toggleApiKey = async (id: string, is_active: boolean) => {
    try {
      await updateApiKey(id, { is_active });
    } catch (error) {
      // Error handling is done in updateApiKey
      throw error;
    }
  };

  useEffect(() => {
    loadApiKeys();
  }, []);

  return {
    keys,
    loading,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    toggleApiKey,
    refreshKeys: loadApiKeys
  };
}