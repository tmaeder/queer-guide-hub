/**
 * useAutomationMonitor — Hook for the background automation system.
 *
 * Provides real-time data for automation modules, content flags, link validations,
 * and geo validations. Supports module toggling, flag review, and manual triggers.
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AutomationModule {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  category: string;
  is_enabled: boolean;
  confidence_threshold: number;
  auto_approve: boolean;
  schedule: string | null;
  batch_size: number;
  rate_limit_per_minute: number;
  priority: number;
  config: Record<string, unknown>;
  last_run_at: string | null;
  last_run_status: string | null;
  total_runs: number;
  total_items_processed: number;
  created_at: string;
  updated_at: string;
}

export type FlagStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'expired';

export interface ContentFlag {
  id: string;
  module_name: string;
  content_type: string;
  content_id: string;
  flag_type: string;
  severity: string;
  confidence: number | null;
  title: string;
  description: string | null;
  current_value: Record<string, unknown> | null;
  suggested_value: Record<string, unknown> | null;
  auto_approved: boolean;
  status: FlagStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkValidation {
  id: string;
  content_type: string;
  content_id: string;
  field_name: string;
  original_url: string;
  normalized_url: string | null;
  http_status: number | null;
  redirect_url: string | null;
  is_alive: boolean | null;
  is_https: boolean | null;
  had_tracking_params: boolean;
  stripped_params: string[];
  response_time_ms: number | null;
  error_message: string | null;
  last_checked_at: string;
  check_count: number;
  created_at: string;
}

export interface GeoValidation {
  id: string;
  content_type: string;
  content_id: string;
  original_lat: number | null;
  original_lng: number | null;
  geocoded_address: string | null;
  continent: string | null;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  queer_village: string | null;
  timezone: string | null;
  confidence: number | null;
  has_mismatch: boolean;
  mismatch_details: string | null;
  source: string | null;
  last_validated_at: string;
  created_at: string;
}

export interface AutomationStats {
  totalModules: number;
  enabledModules: number;
  pendingFlags: number;
  appliedFlags: number;
  deadLinks: number;
  geoMismatches: number;
  totalProcessed: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const QUERY_KEYS = {
  modules: ['automation-modules'] as const,
  flags: ['content-flags'] as const,
  flagStats: ['content-flag-stats'] as const,
  links: ['link-validations'] as const,
  geo: ['geo-validations'] as const,
};

const STALE_TIME = 30_000;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAutomationMonitor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Realtime subscription for content_flags ─────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('content-flags-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_flags' }, () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.flags });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.flagStats });
      })
      .subscribe();

    return () => {
      api.removeChannel(channel);
    };
  }, [queryClient]);

  // ── Automation Modules ──────────────────────────────────────────────────
  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: QUERY_KEYS.modules,
    queryFn: async (): Promise<AutomationModule[]> => {
      const { data, error } = await supabase
        .from('automation_modules' as never)
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AutomationModule[];
    },
    staleTime: 60_000,
  });

  // ── Pending Flags (review queue) ────────────────────────────────────────
  const { data: pendingFlags = [], isLoading: flagsLoading } = useQuery({
    queryKey: QUERY_KEYS.flags,
    queryFn: async (): Promise<ContentFlag[]> => {
      const { data, error } = await supabase
        .from('content_flags' as never)
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ContentFlag[];
    },
    staleTime: STALE_TIME,
  });

  // ── Flag Stats ──────────────────────────────────────────────────────────
  const { data: flagStats } = useQuery({
    queryKey: QUERY_KEYS.flagStats,
    queryFn: async () => {
      const [pending, applied, rejected] = await Promise.all([
        supabase
          .from('content_flags' as never)
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('content_flags' as never)
          .select('*', { count: 'exact', head: true })
          .eq('status', 'applied'),
        supabase
          .from('content_flags' as never)
          .select('*', { count: 'exact', head: true })
          .eq('status', 'rejected'),
      ]);
      return {
        pending: pending.count || 0,
        applied: applied.count || 0,
        rejected: rejected.count || 0,
      };
    },
    staleTime: STALE_TIME,
  });

  // ── Dead links ──────────────────────────────────────────────────────────
  const { data: deadLinks = [], isLoading: linksLoading } = useQuery({
    queryKey: QUERY_KEYS.links,
    queryFn: async (): Promise<LinkValidation[]> => {
      const { data, error } = await supabase
        .from('link_validations' as never)
        .select('*')
        .eq('is_alive', false)
        .order('last_checked_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as LinkValidation[];
    },
    staleTime: STALE_TIME,
  });

  // ── Geo mismatches ─────────────────────────────────────────────────────
  const { data: geoMismatches = [], isLoading: geoLoading } = useQuery({
    queryKey: QUERY_KEYS.geo,
    queryFn: async (): Promise<GeoValidation[]> => {
      const { data, error } = await supabase
        .from('geo_validations' as never)
        .select('*')
        .eq('has_mismatch', true)
        .order('last_validated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as GeoValidation[];
    },
    staleTime: STALE_TIME,
  });

  // ── Computed stats ─────────────────────────────────────────────────────
  const stats = useMemo<AutomationStats>(
    () => ({
      totalModules: modules.length,
      enabledModules: modules.filter((m) => m.is_enabled).length,
      pendingFlags: flagStats?.pending || 0,
      appliedFlags: flagStats?.applied || 0,
      deadLinks: deadLinks.length,
      geoMismatches: geoMismatches.length,
      totalProcessed: modules.reduce((sum, m) => sum + m.total_items_processed, 0),
    }),
    [modules, flagStats, deadLinks, geoMismatches],
  );

  // ── Actions ────────────────────────────────────────────────────────────

  const toggleModule = useMutation({
    mutationFn: async ({ moduleId, enabled }: { moduleId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('automation_modules' as never)
        .update({ is_enabled: enabled } as never)
        .eq('id', moduleId as never);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast({
        title: `Module ${variables.enabled ? 'enabled' : 'disabled'}`,
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.modules });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to toggle module', description: err.message, variant: 'destructive' });
    },
  });

  const updateModuleConfig = useMutation({
    mutationFn: async ({
      moduleId,
      updates,
    }: {
      moduleId: string;
      updates: Partial<AutomationModule>;
    }) => {
      const { error } = await supabase
        .from('automation_modules' as never)
        .update(updates as never)
        .eq('id', moduleId as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Module updated' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.modules });
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    },
  });

  const reviewFlag = useMutation({
    mutationFn: async ({ flagId, action }: { flagId: string; action: 'approved' | 'rejected' }) => {
      const updates: Record<string, unknown> = {
        status: action,
        reviewed_at: new Date().toISOString(),
      };
      if (action === 'approved') {
        updates.applied_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('content_flags' as never)
        .update(updates as never)
        .eq('id', flagId as never);
      if (error) throw error;

      // If approved, apply the suggested change
      if (action === 'approved') {
        const flag = pendingFlags.find((f) => f.id === flagId);
        if (flag?.suggested_value) {
          const { error: applyError } = await supabase
            .from(flag.content_type as never)
            .update(flag.suggested_value as never)
            .eq('id', flag.content_id as never);
          if (applyError) {
            console.error('Failed to apply change:', applyError);
          }
        }
      }
    },
    onSuccess: (_, variables) => {
      toast({ title: `Flag ${variables.action}` });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.flags });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.flagStats });
    },
    onError: (err: Error) => {
      toast({ title: 'Review failed', description: err.message, variant: 'destructive' });
    },
  });

  const bulkReviewFlags = useMutation({
    mutationFn: async ({
      flagIds,
      action,
    }: {
      flagIds: string[];
      action: 'approved' | 'rejected';
    }) => {
      const updates: Record<string, unknown> = {
        status: action,
        reviewed_at: new Date().toISOString(),
      };
      if (action === 'approved') {
        updates.applied_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('content_flags' as never)
        .update(updates as never)
        .in('id', flagIds as never);
      if (error) throw error;

      // If approved, apply all suggested changes
      if (action === 'approved') {
        for (const flagId of flagIds) {
          const flag = pendingFlags.find((f) => f.id === flagId);
          if (flag?.suggested_value) {
            await supabase
              .from(flag.content_type as never)
              .update(flag.suggested_value as never)
              .eq('id', flag.content_id as never);
          }
        }
      }
    },
    onSuccess: (_, variables) => {
      toast({
        title: `${variables.flagIds.length} flags ${variables.action}`,
        description: variables.action === 'approved' ? 'Changes have been applied.' : undefined,
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.flags });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.flagStats });
    },
    onError: (err: Error) => {
      toast({ title: 'Bulk review failed', description: err.message, variant: 'destructive' });
    },
  });

  const triggerModule = useMutation({
    mutationFn: async (moduleName: string) => {
      const { data, error } = await api.functions.invoke('workflow-dispatcher', {
        body: {
          action: 'enqueue',
          workflow: getWorkflowForModule(moduleName),
          module: moduleName,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, moduleName) => {
      toast({
        title: 'Module triggered',
        description: `"${moduleName}" has been queued for execution.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Trigger failed', description: err.message, variant: 'destructive' });
    },
  });

  const getModuleByName = useCallback(
    (name: string) => modules.find((m) => m.name === name),
    [modules],
  );

  return {
    // Data
    modules,
    pendingFlags,
    deadLinks,
    geoMismatches,
    stats,
    flagStats,

    // Loading states
    isLoading: modulesLoading || flagsLoading,
    linksLoading,
    geoLoading,

    // Actions
    toggleModule: toggleModule.mutateAsync,
    updateModuleConfig: updateModuleConfig.mutateAsync,
    reviewFlag: reviewFlag.mutateAsync,
    bulkReviewFlags: bulkReviewFlags.mutateAsync,
    triggerModule: triggerModule.mutateAsync,

    // Mutation states
    isToggling: toggleModule.isPending,
    isReviewing: reviewFlag.isPending,
    isTriggering: triggerModule.isPending,

    // Helpers
    getModuleByName,
  };
}

// ── Helper ───────────────────────────────────────────────────────────────────

function getWorkflowForModule(moduleName: string): string {
  const map: Record<string, string> = {
    'content-quality-checker': 'content-quality-check',
    'link-validator': 'link-validation-full',
    'geo-enricher': 'geo-enrichment',
    'date-normalizer': 'date-normalization',
    'auto-tagger': 'auto-tag-classify',
    'contact-normalizer': 'contact-normalization',
    'ai-content-enhancer': 'ai-content-enhancement',
  };
  return map[moduleName] || moduleName;
}
