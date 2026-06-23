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

/** Content types the /admin/duplicates surface can review + merge. */
export type DedupContentType = 'venue' | 'event' | 'marketplace' | 'personality';

// Per-type table + the columns we need for the canonical suggestion. Marketplace
// has no is_featured; only venues carry an images array for the thumbnail icon.
const META_TABLE: Record<DedupContentType, string> = {
  venue: 'venues',
  event: 'events',
  marketplace: 'marketplace_listings',
  personality: 'personalities',
};
const META_COLS: Record<DedupContentType, string> = {
  venue: 'id, quality_score, trust_score, images, created_at, is_featured',
  event: 'id, quality_score, created_at, is_featured',
  marketplace: 'id, quality_score, created_at',
  personality: 'id, quality_score, created_at, is_featured',
};

export function useDuplicateClusters(contentType: DedupContentType = 'venue') {
  const clustersQuery = useQuery({
    queryKey: ['dup-clusters', contentType],
    queryFn: async (): Promise<Cluster[]> => {
      const { data, error } = await supabase.rpc('find_duplicate_clusters' as never, {
        p_content_type: contentType,
        p_limit: 200,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Cluster[];
    },
  });

  const clusters = useMemo(() => clustersQuery.data ?? [], [clustersQuery.data]);
  const memberIds = useMemo(() => clusters.flatMap((c) => c.members.map((m) => m.id)), [clusters]);

  const metaQuery = useQuery({
    queryKey: ['dup-entity-meta', contentType, memberIds],
    enabled: memberIds.length > 0,
    queryFn: async (): Promise<Map<string, VenueMeta>> => {
      const { data, error } = await supabase
        .from(META_TABLE[contentType] as never)
        .select(META_COLS[contentType])
        .in('id', memberIds);
      if (error) throw error;
      return new Map((data as unknown as VenueMeta[]).map((v) => [v.id, v]));
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

// --- Fuzzy (same-place) dedup — Phase 1 -----------------------------------
// find_fuzzy_duplicate_clusters surfaces near-identical names at effectively the
// same coordinates that the exact name+city grouping misses (word-order swaps,
// punctuation). auto_eligible pairs (name ≥0.92, ≤100m) are what the automated
// pass acts on; the rest are here for a human to merge.

export interface FuzzyMember {
  id: string;
  title: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  quality_score: number | null;
  is_featured: boolean | null;
}
export interface FuzzyCluster {
  score: number;
  match_type: 'geo_name' | 'city_name';
  dist_m: number | null;
  auto_eligible: boolean;
  count: number;
  members: FuzzyMember[];
}

export function useFuzzyDuplicateClusters() {
  const query = useQuery({
    queryKey: ['fuzzy-dup-clusters', 'venue'],
    queryFn: async (): Promise<FuzzyCluster[]> => {
      const { data, error } = await supabase.rpc('find_fuzzy_duplicate_clusters' as never, {
        p_limit: 300,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as FuzzyCluster[];
    },
  });
  return {
    clusters: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
  };
}

/** Auto-merge the unambiguous same-place pairs (name ≥0.92, ≤100m). */
export async function runFuzzyAutomerge(dryRun: boolean): Promise<{
  merged: number;
  eligible_pairs: number;
  skipped: number;
  chains_collapsed: number;
  dry_run: boolean;
}> {
  const { data, error } = await supabase.rpc('run_venue_fuzzy_automerge' as never, {
    p_dry_run: dryRun,
  } as never);
  if (error) throw error;
  return data as never;
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

/** Reverse a venue merge by its audit id. */
export async function unmergeAudit(auditId: string): Promise<void> {
  const { error } = await supabase.rpc('unmerge_venues' as never, { p_audit_id: auditId } as never);
  if (error) throw error;
}

/**
 * Merge one duplicate into the canonical for ANY supported content type.
 * Venues keep their dedicated merge_venues RPC; events / marketplace /
 * personalities go through the generic merge_entities dispatcher. Returns the
 * audit id for undo.
 */
export async function mergeEntityPair(
  contentType: DedupContentType,
  keepId: string,
  dropId: string,
): Promise<string | undefined> {
  if (contentType === 'venue') return mergeVenuePair(keepId, dropId);
  const { data, error } = await supabase.rpc('merge_entities' as never, {
    p_type: contentType,
    p_keep_id: keepId,
    p_drop_id: dropId,
  } as never);
  if (error) throw error;
  return (data as { audit_id?: string } | null)?.audit_id;
}

/** Reverse a merge by audit id for ANY supported content type. */
export async function unmergeEntity(contentType: DedupContentType, auditId: string): Promise<void> {
  if (contentType === 'venue') return unmergeAudit(auditId);
  const { error } = await supabase.rpc('unmerge_entities' as never, { p_audit_id: auditId } as never);
  if (error) throw error;
}
