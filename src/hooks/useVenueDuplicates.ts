import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Data + mutations for the /admin/duplicates surface (dedup Phase 1).
 *
 * RPCs (`find_duplicate_clusters`, `merge_venues`, `unmerge_venues`) and the
 * `venue_slug_redirects` table aren't in the generated Supabase types yet, so
 * calls are cast — the project's convention for not-yet-regenerated schema.
 */

export interface ClusterMember {
  id: string;
  title: string;
  slug: string | null;
  city: string | null;
  country: string | null;
}
export interface Cluster {
  city: string | null;
  count: number;
  normalized_title: string;
  members: ClusterMember[];
}
export interface VenueMeta {
  id: string;
  quality_score: number | null;
  trust_score: number | null;
  images: unknown;
  created_at: string | null;
  is_featured: boolean | null;
}

export function useDuplicateClusters() {
  const clustersQuery = useQuery({
    queryKey: ['dup-clusters', 'venue'],
    queryFn: async (): Promise<Cluster[]> => {
      const { data, error } = await supabase.rpc('find_duplicate_clusters' as never, {
        p_content_type: 'venue',
        p_limit: 200,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Cluster[];
    },
  });

  const clusters = useMemo(() => clustersQuery.data ?? [], [clustersQuery.data]);
  const memberIds = useMemo(() => clusters.flatMap((c) => c.members.map((m) => m.id)), [clusters]);

  const metaQuery = useQuery({
    queryKey: ['dup-venue-meta', memberIds],
    enabled: memberIds.length > 0,
    queryFn: async (): Promise<Map<string, VenueMeta>> => {
      const { data, error } = await supabase
        .from('venues')
        .select('id, quality_score, trust_score, images, created_at, is_featured')
        .in('id', memberIds);
      if (error) throw error;
      return new Map((data as VenueMeta[]).map((v) => [v.id, v]));
    },
  });

  return {
    clusters,
    meta: metaQuery.data ?? new Map<string, VenueMeta>(),
    isLoading: clustersQuery.isLoading,
    isError: clustersQuery.isError,
    error: clustersQuery.error as Error | null,
  };
}

/** Merge one duplicate into the canonical; returns the audit id for undo. */
export async function mergeVenuePair(keepId: string, dropId: string): Promise<string | undefined> {
  const { data, error } = await supabase.rpc('merge_venues' as never, {
    p_keep_id: keepId,
    p_drop_id: dropId,
  } as never);
  if (error) throw error;
  return (data as { audit_id?: string } | null)?.audit_id;
}

/** Reverse a merge by its audit id. */
export async function unmergeAudit(auditId: string): Promise<void> {
  const { error } = await supabase.rpc('unmerge_venues' as never, { p_audit_id: auditId } as never);
  if (error) throw error;
}
