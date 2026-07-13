import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isBaseNode, type AppNode, type NodeRunStatus } from '../types';

interface NodeState {
  status: NodeRunStatus;
  started_at?: string;
  completed_at?: string;
  items_in: number;
  items_out: number;
  error?: string;
  duration_ms?: number;
}

interface PipelineRunUpdate {
  id: string;
  status: string;
  node_states: Record<string, NodeState>;
  items_total: number;
  items_processed: number;
  items_succeeded: number;
  items_failed: number;
}

/**
 * Subscribe to Realtime updates for a pipeline run and overlay
 * per-node status badges onto the React Flow canvas nodes.
 */
export function usePipelineExecution(
  activeRunId: string | null,
  setNodes: (updater: (nodes: AppNode[]) => AppNode[]) => void
) {
  const queryClient = useQueryClient();
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const applyNodeStates = useCallback((nodeStates: Record<string, NodeState>) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (!isBaseNode(node)) return node; // only base nodes carry run state
        const state = nodeStates[node.id];
        if (!state) return node;

        return {
          ...node,
          data: {
            ...node.data,
            status: state.status,
            itemsOut: state.items_out,
            itemsIn: state.items_in,
            durationMs: state.duration_ms,
            errorMessage: state.error,
          },
        };
      })
    );
  }, [setNodes]);

  const clearOverlay = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => isBaseNode(node) ? {
        ...node,
        data: {
          ...node.data,
          status: undefined,
          itemsOut: undefined,
          itemsIn: undefined,
          durationMs: undefined,
          errorMessage: undefined,
        },
      } : node)
    );
    setRunStatus(null);
  }, [setNodes]);

  useEffect(() => {
    if (!activeRunId) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const channel = supabase
      .channel(`pipeline-run-${activeRunId}`)
      .on(
        'postgres_changes' as const,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pipeline_runs',
          filter: `id=eq.${activeRunId}`,
        },
        (payload: { new: PipelineRunUpdate }) => {
          const run = payload.new;
          setRunStatus(run.status);
          applyNodeStates(run.node_states);

          // Invalidate queries when run completes
          if (['completed', 'failed', 'cancelled'].includes(run.status)) {
            queryClient.invalidateQueries({ queryKey: ['pipeline-runs'] });
            queryClient.invalidateQueries({ queryKey: ['staging-stats'] });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [activeRunId, applyNodeStates, queryClient]);

  return { runStatus, clearOverlay };
}
