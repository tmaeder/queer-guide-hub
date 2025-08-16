import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

export interface Connector {
  id: string;
  name: string;
  provider: string;
  config: any;
  mapping_profile: any;
  last_sync_at: string | null;
  next_sync_at: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  sync_schedule: string | null;
}

export interface SyncJob {
  id: string;
  connector_id: string;
  job_type: string;
  status: string;
  records_processed: number | null;
  records_created: number | null;
  records_updated: number | null;
  records_failed: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  error_details: any;
}

export function useCMSConnectors() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchConnectors = async () => {
    try {
      setError(null);
      const { data, error } = await supabase
        .from('cms_connectors')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConnectors(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching connectors:', err);
    }
  };

  const fetchSyncJobs = async () => {
    try {
      const { data, error } = await supabase
        .from('cms_sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSyncJobs(data || []);
    } catch (err: any) {
      console.error('Error fetching sync jobs:', err);
    }
  };

  const createConnector = async (connectorData: { name: string; provider: string; description?: string; sync_schedule?: string; is_active?: boolean }) => {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('cms_connectors')
        .insert({
          name: connectorData.name,
          provider: connectorData.provider,
          created_by: user.data.user.id,
          config: {},
          mapping_profile: {},
          sync_schedule: connectorData.sync_schedule || '0 */6 * * *',
          is_active: connectorData.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      setConnectors(prev => [data as Connector, ...prev]);
      toast({
        title: "Success",
        description: "Connector created successfully",
      });

      return data;
    } catch (err: any) {
      toast({
        title: "Error",
        description: `Failed to create connector: ${err.message}`,
        variant: "destructive",
      });
      throw err;
    }
  };

  const updateConnector = async (id: string, updates: Partial<Connector>) => {
    try {
      const { data, error } = await supabase
        .from('cms_connectors')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setConnectors(prev => 
        prev.map(c => c.id === id ? { ...c, ...updates } : c)
      );

      return data;
    } catch (err: any) {
      toast({
        title: "Error",
        description: `Failed to update connector: ${err.message}`,
        variant: "destructive",
      });
      throw err;
    }
  };

  const deleteConnector = async (id: string) => {
    try {
      const { error } = await supabase
        .from('cms_connectors')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setConnectors(prev => prev.filter(c => c.id !== id));
      toast({
        title: "Success",
        description: "Connector deleted successfully",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: `Failed to delete connector: ${err.message}`,
        variant: "destructive",
      });
      throw err;
    }
  };

  const toggleConnector = async (id: string, isActive: boolean) => {
    try {
      await updateConnector(id, { is_active: isActive });
      toast({
        title: "Success",
        description: `Connector ${isActive ? 'enabled' : 'disabled'}`,
      });
    } catch (err: any) {
      // Error already handled in updateConnector
      throw err;
    }
  };

  const runConnector = async (connectorId: string) => {
    try {
      const connector = connectors.find(c => c.id === connectorId);
      if (!connector) throw new Error('Connector not found');

      if (!connector.is_active) {
        throw new Error('Connector is disabled');
      }

      toast({
        title: "Starting Sync",
        description: `Starting ${connector.name} synchronization...`,
      });

      const { data, error } = await supabase.functions.invoke('cms-connector-sync', {
        body: { 
          connectorId: connector.id, 
          provider: connector.provider, 
          config: connector.config 
        }
      });

      if (error) throw error;

      // Refresh data
      await Promise.all([fetchConnectors(), fetchSyncJobs()]);

      toast({
        title: "Sync Started",
        description: data?.success 
          ? `Successfully processed ${data.recordsProcessed || 0} records`
          : `Sync completed with errors: ${data?.error || 'Unknown error'}`,
        variant: data?.success ? "default" : "destructive",
      });

      return data;
    } catch (err: any) {
      toast({
        title: "Error",
        description: `Failed to run connector: ${err.message}`,
        variant: "destructive",
      });
      throw err;
    }
  };

  const getConnectorStats = () => {
    const totalConnectors = connectors.length;
    const activeConnectors = connectors.filter(c => c.is_active).length;
    const recentJobs = syncJobs.slice(0, 5);
    const successfulJobs = syncJobs.filter(j => j.status === 'completed').length;
    const failedJobs = syncJobs.filter(j => j.status === 'failed').length;
    
    return {
      totalConnectors,
      activeConnectors,
      recentJobs,
      successfulJobs,
      failedJobs,
      successRate: syncJobs.length > 0 ? (successfulJobs / syncJobs.length) * 100 : 0,
    };
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchConnectors(), fetchSyncJobs()]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Real-time subscriptions
  useEffect(() => {
    const connectorsSubscription = supabase
      .channel('cms_connectors_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'cms_connectors' },
        () => fetchConnectors()
      )
      .subscribe();

    const jobsSubscription = supabase
      .channel('cms_sync_jobs_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'cms_sync_jobs' },
        () => fetchSyncJobs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(connectorsSubscription);
      supabase.removeChannel(jobsSubscription);
    };
  }, []);

  return {
    connectors,
    syncJobs,
    loading,
    error,
    fetchConnectors,
    fetchSyncJobs,
    createConnector,
    updateConnector,
    deleteConnector,
    toggleConnector,
    runConnector,
    getConnectorStats,
  };
}