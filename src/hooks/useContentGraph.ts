import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { typeMeta, type ContentGraphSnapshot } from '@/components/admin/content-graph/contentGraphMeta';

/**
 * Macro ontology snapshot for the admin Content Graph. Reads the
 * nightly-recomputed `admin_content_graph` RPC (admin-gated, returns
 * {nodes, edges, generated_at}).
 */
export function useContentGraph() {
  return useQuery<ContentGraphSnapshot>({
    queryKey: ['admin-content-graph'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_content_graph');
      if (error) throw error;
      return (data ?? { nodes: [], edges: [], generated_at: '' }) as unknown as ContentGraphSnapshot;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
}

/**
 * Title search over one content-type table, for the instance-explorer picker.
 * Disabled until the type has a searchable table and the query is ≥2 chars.
 */
export function useContentGraphRecordSearch(type: string, q: string) {
  const meta = typeMeta(type);
  const term = q.trim();
  return useQuery({
    queryKey: ['content-graph-record-search', type, term],
    enabled: !!meta.table && term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(meta.table as string)
        .select(`id, ${meta.titleCol}`)
        .ilike(meta.titleCol, `%${term}%`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, string>>;
    },
    staleTime: 30_000,
  });
}
