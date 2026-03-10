import { useState, useEffect } from 'react';
import { api } from '@/integrations/api/client';
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

export interface RequiredKeyStatus {
  key_name: string;
  status: 'configured' | 'missing' | 'error';
  hint: string;
  used_by: {
    name: string;
    slug: string;
    source_type: string;
    is_enabled: boolean;
  }[];
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
  const [requiredKeys, setRequiredKeys] = useState<RequiredKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadKeyStatus = async () => {
    try {
      setLoading(true);
      const { data, error } = await api.functions.invoke('manage-api-keys?action=status', {
        method: 'GET',
      });

      if (error) throw error;

      setRequiredKeys(data.required_keys || []);
      setKeys(data.custom_keys || []);
    } catch (error) {
      console.error('Error loading API key status:', error);
      toast({
        title: 'Error',
        description: 'Failed to load API key status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async (keyData: CreateApiKeyRequest) => {
    try {
      const { data, error } = await api.functions.invoke('manage-api-keys', {
        method: 'POST',
        body: keyData,
      });

      if (error) throw error;

      await loadKeyStatus();
      toast({
        title: 'Success',
        description: 'API key created successfully',
      });

      return data.key;
    } catch (error: any) {
      console.error('Error creating API key:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create API key',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const updateApiKey = async (id: string, updateData: UpdateApiKeyRequest) => {
    try {
      const { data, error } = await api.functions.invoke('manage-api-keys', {
        method: 'PUT',
        body: { ...updateData, id },
      });

      if (error) throw error;

      await loadKeyStatus();
      toast({
        title: 'Success',
        description: 'API key updated successfully',
      });

      return data.key;
    } catch (error: any) {
      console.error('Error updating API key:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update API key',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const deleteApiKey = async (id: string) => {
    try {
      const { error } = await api.functions.invoke('manage-api-keys', {
        method: 'DELETE',
        body: { id },
      });

      if (error) throw error;

      await loadKeyStatus();
      toast({
        title: 'Success',
        description: 'API key deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting API key:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete API key',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const toggleApiKey = async (id: string, is_active: boolean) => {
    await updateApiKey(id, { is_active });
  };

  useEffect(() => {
    loadKeyStatus();
  }, []);

  return {
    keys,
    requiredKeys,
    loading,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    toggleApiKey,
    refreshKeys: loadKeyStatus,
  };
}
