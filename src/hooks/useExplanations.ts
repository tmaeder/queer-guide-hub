/**
 * Registered prose for a set of `pipeline_explanations` keys.
 *
 * Returns ONLY rows that exist and are active. A key missing from the map is
 * unregistered, and callers must render it raw in monospace — never a
 * prettified derivation of the key (see 99991790358904's header).
 */
import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface PipelineExplanation {
  key: string;
  title: string;
  body: string;
  what_now: string | null;
  severity: 'info' | 'warning' | 'blocking';
}

export function useExplanations(keys: string[]) {
  const sorted = [...new Set(keys)].sort();
  return useQuery({
    queryKey: ['pipeline-explanations', sorted],
    queryFn: async () => {
      const { data, error } = await untypedFrom('pipeline_explanations')
        .select('key, title, body, what_now, severity')
        .in('key', sorted)
        .eq('active', true);
      if (error) throw new Error(error.message);
      return new Map(
        ((data ?? []) as unknown as PipelineExplanation[]).map((row) => [row.key, row]),
      );
    },
    enabled: sorted.length > 0,
    staleTime: 10 * 60_000,
  });
}
