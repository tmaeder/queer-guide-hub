import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FreigabeStufe } from '@/lib/personalityStatus';

export type FreigabeFunnel = Record<FreigabeStufe, number>;

export interface FreigabeQueueRow {
  id: string;
  name: string;
  slug: string | null;
  image_url: string | null;
  lgbti_relevance_score: number | null;
  completeness_score: number | null;
  needs_attention: boolean | null;
  stage: FreigabeStufe;
  reasons: string[] | null;
}

// New RPCs aren't in the generated Supabase types yet — deliberate escape hatch.
const db = supabase as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: unknown }>;
};

const EMPTY_FUNNEL: FreigabeFunnel = {
  erfasst: 0,
  in_pruefung: 0,
  freigabe_bereit: 0,
  veroeffentlicht: 0,
  abgelehnt: 0,
};

/** Stage counts for the Freigabe funnel dashboard. */
export function useFreigabeFunnel() {
  return useQuery<FreigabeFunnel>({
    queryKey: ['personality-freigabe-funnel'],
    queryFn: async () => {
      const { data, error } = await db.rpc('personality_freigabe_funnel');
      if (error) throw error;
      return { ...EMPTY_FUNNEL, ...((data ?? {}) as Partial<FreigabeFunnel>) };
    },
    staleTime: 60_000,
  });
}

/** Work list for one Freigabe stage (default: the manual "in_pruefung" queue). */
export function useFreigabeQueue(stage: FreigabeStufe) {
  return useQuery<FreigabeQueueRow[]>({
    queryKey: ['personality-freigabe-queue', stage],
    queryFn: async () => {
      const { data, error } = await db.rpc('personalities_freigabe_queue', {
        p_stage: stage,
        p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as FreigabeQueueRow[];
    },
    staleTime: 30_000,
  });
}

/** Freigeben / Ablehnen / Rücknahme mutations, invalidating funnel + queues. */
export function useFreigabeAction() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['personality-freigabe-funnel'] });
    queryClient.invalidateQueries({ queryKey: ['personality-freigabe-queue'] });
    queryClient.invalidateQueries({ queryKey: ['personality-quality-summary'] });
    queryClient.invalidateQueries({ queryKey: ['personality-check-counts'] });
  };

  const freigeben = useMutation({
    mutationFn: async ({ id, confirm }: { id: string; confirm?: boolean }) => {
      const { data, error } = await db.rpc('freigabe_personality', {
        p_id: id,
        p_confirm: confirm ?? false,
      });
      if (error) throw error;
      if (data && data.ok === false) {
        const err = new Error(String(data.error ?? 'freigabe_failed')) as Error & {
          code?: string;
        };
        err.code = String(data.error ?? '');
        throw err;
      }
      return data;
    },
    onSuccess: invalidate,
  });

  const ablehnen = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data, error } = await db.rpc('reject_personality_capture', {
        p_id: id,
        p_reason: reason ?? 'rejected at capture',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const zuruecknehmen = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.rpc('unfreigabe_personality', { p_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  return { freigeben, ablehnen, zuruecknehmen };
}
