import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import type {
  KnowledgeEntry,
  KnowledgeProposal,
  KnowledgeBatch,
  KnowledgeKind,
  PublicKnowledgeEditorial,
} from '@/lib/knowledge/editorial';

export function useKnowledgeEditorial() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['knowledge-editorial'],
    queryFn: async () => {
      const [entries, proposals, batches, events] = await Promise.all([
        untypedFrom('knowledge_editorial_entries').select('*').order('pilot_group'),
        untypedFrom('knowledge_editorial_proposals')
          .select('*')
          .order('created_at', { ascending: false }),
        untypedFrom('knowledge_editorial_batches')
          .select('*')
          .order('created_at', { ascending: false }),
        untypedFrom('knowledge_editorial_events')
          .select('proposal_id,detail,created_at')
          .eq('action', 'worker_error')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);
      for (const response of [entries, proposals, batches, events])
        if (response.error) throw new Error(response.error.message);
      return {
        entries: entries.data as unknown as KnowledgeEntry[],
        proposals: proposals.data as unknown as KnowledgeProposal[],
        batches: batches.data as unknown as KnowledgeBatch[],
        events: events.data as unknown as {
          proposal_id: string;
          detail: { reason: string };
          created_at: string;
        }[],
      };
    },
  });
  const action = useMutation({
    mutationFn: async ({
      action,
      id,
      payload = {},
    }: {
      action: string;
      id: string;
      payload?: Record<string, unknown>;
    }) => {
      const { data, error } = await untypedRpc<{ ok?: boolean; error?: string }>(
        'knowledge_editorial_action',
        { p_action: action, p_id: id, p_payload: payload },
      );
      if (error || data?.ok === false)
        throw new Error(error?.message ?? data?.error ?? 'Publication failed');
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['knowledge-editorial'] }),
  });
  const worker = useMutation({
    mutationFn: async ({
      action,
      id,
    }: {
      action: 'generate' | 'validate' | 'sweep';
      id: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('knowledge-editorial', {
        body: { action, id },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['knowledge-editorial'] }),
  });
  return { ...query, action, worker };
}
export function usePublicKnowledgeEditorial(kind: KnowledgeKind, ids: string[]) {
  const stableIds = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['knowledge-public-editorial', kind, stableIds],
    enabled: stableIds.length > 0,
    queryFn: async () => {
      const rows: PublicKnowledgeEditorial[] = [];
      for (let i = 0; i < stableIds.length; i += 100) {
        const { data, error } = await untypedRpc<PublicKnowledgeEditorial[]>(
          'knowledge_public_editorial',
          { p_kind: kind, p_ids: stableIds.slice(i, i + 100) },
        );
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
      }
      return rows;
    },
    staleTime: 60_000,
    retry: false,
  });
}
