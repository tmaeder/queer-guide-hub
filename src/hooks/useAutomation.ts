/**
 * useAutomation — Supabase Realtime hook for the automation pipeline dashboard.
 *
 * Live postgres_changes subscription on `content_changes` table.
 * React Query for modules, changes, run history, stats.
 * Mutations: approve/reject changes, toggle/run modules, update settings.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface AutomationModule {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  module_type: string;
  content_types: string[];
  is_enabled: boolean;
  auto_approve_threshold: number;
  batch_size: number;
  rate_limit_per_hour: number;
  config: Record<string, unknown>;
  workflow_definition_id: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  total_runs: number;
  total_changes_proposed: number;
  total_changes_applied: number;
  created_at: string;
  updated_at: string;
}

export type ChangeStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'auto_approved'
  | 'applied'
  | 'reverted';

export interface ContentChange {
  id: string;
  module_id: string;
  rule_id: string | null;
  workflow_run_id: string | null;
  content_type: string;
  content_id: string;
  content_name: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  change_type: string;
  confidence: number;
  reasoning: string | null;
  status: ChangeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRunLog {
  id: string;
  module_id: string;
  workflow_run_id: string | null;
  content_type: string | null;
  items_scanned: number;
  changes_proposed: number;
  changes_auto_approved: number;
  changes_pending_review: number;
  errors: number;
  duration_ms: number;
  created_at: string;
}

export interface AutomationStats {
  pending_changes: number;
  auto_approved_24h: number;
  total_proposed_24h: number;
  modules_enabled: number;
  modules_total: number;
  last_run: string | null;
  approval_rate: number;
}

// ── Constants ───────────────────────────────────────────────────────────────────

const QUERY_KEYS = {
  modules: ['automation-modules'] as const,
  changes: ['automation-changes'] as const,
  pendingChanges: ['automation-pending-changes'] as const,
  runHistory: ['automation-run-history'] as const,
  stats: ['automation-stats'] as const,
};

const STALE_TIME = 30_000;

// ── Hook ────────────────────────────────────────────────────────────────────────

export function useAutomation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Tracks whether a module run is in progress — used by runHistory refetchInterval
  const isRunningRef = useRef(false);

  // Tracks the active run so the UI can show progress
  const [activeRun, setActiveRun] = useState<{
    startedAt: string;
    slug: string;
    fullScan: boolean;
  } | null>(null);

  // ── Realtime subscription on content_changes ────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('automation-changes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_changes' }, () => {
        // During active runs, skip Realtime-triggered invalidation entirely —
        // stats/changes/pending are polled via refetchInterval instead.
        if (isRunningRef.current) return;
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changes });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingChanges });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.stats });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // ── Modules ───────────────────────────────────────────────────────────────────
  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: QUERY_KEYS.modules,
    queryFn: async (): Promise<AutomationModule[]> => {
      const { data, error } = await supabase
        .from('automation_modules' as never)
        .select('*')
        .order('display_name');
      if (error) throw error;
      return (data ?? []) as unknown as AutomationModule[];
    },
    staleTime: 60_000,
  });

  // ── Pending changes (review queue) ────────────────────────────────────────────
  const { data: pendingChanges = [], isLoading: pendingLoading } = useQuery({
    queryKey: QUERY_KEYS.pendingChanges,
    queryFn: async (): Promise<ContentChange[]> => {
      const { data, error } = await supabase
        .from('content_changes' as never)
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ContentChange[];
    },
    staleTime: STALE_TIME,
    refetchInterval: () => (isRunningRef.current ? 10_000 : false),
  });

  // ── Recent changes (all statuses, last 48h) ──────────────────────────────────
  const { data: recentChanges = [], isLoading: changesLoading } = useQuery({
    queryKey: QUERY_KEYS.changes,
    queryFn: async (): Promise<ContentChange[]> => {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('content_changes' as never)
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as ContentChange[];
    },
    staleTime: STALE_TIME,
    refetchInterval: () => (isRunningRef.current ? 10_000 : false),
  });

  // ── Run history ───────────────────────────────────────────────────────────────
  const { data: runHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: QUERY_KEYS.runHistory,
    queryFn: async (): Promise<AutomationRunLog[]> => {
      const { data, error } = await supabase
        .from('automation_run_log' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as AutomationRunLog[];
    },
    staleTime: STALE_TIME,
    // Poll every 4s while a module is running so progress updates live
    refetchInterval: () => (isRunningRef.current ? 4_000 : false),
  });

  // ── Stats (real DB counts — avoids array-limit inaccuracies) ─────────────────
  const { data: rawStats } = useQuery({
    queryKey: QUERY_KEYS.stats,
    queryFn: async () => {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [pendingRes, autoApprovedRes, totalRes] = await Promise.all([
        supabase
          .from('content_changes' as never)
          .select('*', { count: 'exact', head: true })
          .eq('status' as never, 'pending'),
        supabase
          .from('content_changes' as never)
          .select('*', { count: 'exact', head: true })
          .in('status' as never, ['auto_approved', 'applied'] as never)
          .gte('created_at' as never, since24h as never),
        supabase
          .from('content_changes' as never)
          .select('*', { count: 'exact', head: true })
          .gte('created_at' as never, since24h as never),
      ]);
      return {
        pending: pendingRes.count ?? 0,
        autoApproved24h: autoApprovedRes.count ?? 0,
        total24h: totalRes.count ?? 0,
      };
    },
    staleTime: STALE_TIME,
    // Poll every 10s while a run is active so stats climb smoothly
    refetchInterval: () => (isRunningRef.current ? 10_000 : false),
  });

  const stats = useMemo<AutomationStats>(() => {
    const pending = rawStats?.pending ?? 0;
    const autoApproved = rawStats?.autoApproved24h ?? 0;
    const total = rawStats?.total24h ?? 0;
    const enabledModules = modules.filter((m) => m.is_enabled).length;
    const lastRun =
      modules
        .filter((m) => m.last_run_at)
        .sort((a, b) => (b.last_run_at ?? '').localeCompare(a.last_run_at ?? ''))[0]?.last_run_at ??
      null;

    return {
      pending_changes: pending,
      auto_approved_24h: autoApproved,
      total_proposed_24h: total,
      modules_enabled: enabledModules,
      modules_total: modules.length,
      last_run: lastRun,
      approval_rate: total > 0 ? autoApproved / total : 0,
    };
  }, [rawStats, modules]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const approveChange = useMutation({
    mutationFn: async (changeId: string) => {
      const { data, error } = await supabase.rpc(
        'apply_content_change' as never,
        {
          p_change_id: changeId,
        } as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Change approved and applied' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingChanges });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changes });
    },
    onError: (err: Error) => {
      toast({ title: 'Approve failed', description: err.message, variant: 'destructive' });
    },
  });

  const rejectChange = useMutation({
    mutationFn: async (changeId: string) => {
      const { error } = await supabase
        .from('content_changes' as never)
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
        .eq('id' as never, changeId as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Change rejected' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingChanges });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changes });
    },
    onError: (err: Error) => {
      toast({ title: 'Reject failed', description: err.message, variant: 'destructive' });
    },
  });

  const bulkApprove = useMutation({
    mutationFn: async (changeIds: string[]) => {
      const { data, error } = await supabase.rpc(
        'bulk_apply_content_changes' as never,
        {
          p_change_ids: changeIds,
        } as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      toast({ title: `${variables.length} changes approved and applied` });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingChanges });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changes });
    },
    onError: (err: Error) => {
      toast({ title: 'Bulk approve failed', description: err.message, variant: 'destructive' });
    },
  });

  const bulkReject = useMutation({
    mutationFn: async (changeIds: string[]) => {
      const { error } = await supabase
        .from('content_changes' as never)
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
        .in('id' as never, changeIds as never);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast({ title: `${variables.length} changes rejected` });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingChanges });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changes });
    },
    onError: (err: Error) => {
      toast({ title: 'Bulk reject failed', description: err.message, variant: 'destructive' });
    },
  });

  const toggleModule = useMutation({
    mutationFn: async ({ moduleId, enabled }: { moduleId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('automation_modules' as never)
        .update({ is_enabled: enabled } as never)
        .eq('id' as never, moduleId as never);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast({ title: `Module ${variables.enabled ? 'enabled' : 'disabled'}` });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.modules });
    },
    onError: (err: Error) => {
      toast({ title: 'Toggle failed', description: err.message, variant: 'destructive' });
    },
  });

  const runModule = useMutation({
    mutationFn: async ({
      slug,
      dryRun = false,
      fullScan = false,
    }: {
      slug: string;
      dryRun?: boolean;
      fullScan?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('content-automation', {
        body: { module: slug, dry_run: dryRun, full_scan: fullScan },
      });
      if (error) throw error;
      return data;
    },
    onMutate: (variables) => {
      isRunningRef.current = true;
      setActiveRun({
        startedAt: new Date().toISOString(),
        slug: variables.slug,
        fullScan: variables.fullScan ?? false,
      });
    },
    onSuccess: (data: Record<string, unknown>, variables) => {
      const proposed = data?.changes_proposed ?? 0;
      const scanLabel = variables.fullScan ? ' (full scan)' : '';
      toast({
        title: variables.dryRun
          ? `Dry run complete${scanLabel}`
          : `Module run complete${scanLabel}`,
        description: `${proposed} change${proposed !== 1 ? 's' : ''} proposed.`,
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.modules });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingChanges });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changes });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.runHistory });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.stats });
    },
    onSettled: () => {
      isRunningRef.current = false;
      setActiveRun(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Run failed', description: err.message, variant: 'destructive' });
    },
  });

  const updateModuleSettings = useMutation({
    mutationFn: async ({
      moduleId,
      settings,
    }: {
      moduleId: string;
      settings: Partial<
        Pick<
          AutomationModule,
          | 'auto_approve_threshold'
          | 'batch_size'
          | 'rate_limit_per_hour'
          | 'content_types'
          | 'config'
        >
      >;
    }) => {
      const { error } = await supabase
        .from('automation_modules' as never)
        .update(settings as never)
        .eq('id' as never, moduleId as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Settings updated' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.modules });
    },
    onError: (err: Error) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    },
  });

  const revertChange = useMutation({
    mutationFn: async (changeId: string) => {
      const { data, error } = await supabase.rpc(
        'revert_content_change' as never,
        {
          p_change_id: changeId,
        } as never,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Change reverted' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pendingChanges });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.changes });
    },
    onError: (err: Error) => {
      toast({ title: 'Revert failed', description: err.message, variant: 'destructive' });
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const getModuleBySlug = (slug: string) => modules.find((m) => m.slug === slug);

  return {
    // Data
    modules,
    pendingChanges,
    recentChanges,
    runHistory,
    stats,
    activeRun,

    // Loading
    isLoading: modulesLoading || pendingLoading,
    changesLoading,
    historyLoading,

    // Actions
    approveChange: approveChange.mutateAsync,
    rejectChange: rejectChange.mutateAsync,
    bulkApprove: bulkApprove.mutateAsync,
    bulkReject: bulkReject.mutateAsync,
    toggleModule: toggleModule.mutateAsync,
    runModule: runModule.mutateAsync,
    updateModuleSettings: updateModuleSettings.mutateAsync,
    revertChange: revertChange.mutateAsync,

    // Mutation states
    isApproving: approveChange.isPending,
    isRejecting: rejectChange.isPending,
    isBulkApproving: bulkApprove.isPending,
    isBulkRejecting: bulkReject.isPending,
    isRunning: runModule.isPending,
    runningModuleSlug: runModule.isPending ? (runModule.variables?.slug ?? null) : null,

    // Helpers
    getModuleBySlug,
  };
}
