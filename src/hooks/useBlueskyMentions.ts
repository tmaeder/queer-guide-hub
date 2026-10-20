import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BlueskyMention {
  at_uri: string;
  author_did: string;
  author_handle: string;
  author_name: string | null;
  author_avatar: string | null;
  text: string;
  post_created_at: string | null;
}

export type MentionEntity = 'event' | 'venue';

/** Public Bluesky posts about an event or venue. Empty for gated entities (server-enforced). */
export function useBlueskyMentions(entityType: MentionEntity, entityId: string | undefined) {
  return useQuery({
    queryKey: ['bluesky-mentions', entityType, entityId],
    enabled: !!entityId,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<BlueskyMention[]> => {
      const { data, error } = await supabase.rpc(
        'bluesky_mentions_for' as never,
        { p_entity_type: entityType, p_entity_id: entityId, p_limit: 6 } as never,
      );
      if (error) throw error;
      return (data ?? []) as BlueskyMention[];
    },
  });
}

/** Admin/moderator: hide a post from every rail. */
export function useHideBlueskyMention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (atUri: string) => {
      const { error } = await supabase.rpc(
        'hide_bluesky_mention' as never,
        { p_at_uri: atUri } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bluesky-mentions'] }),
  });
}
