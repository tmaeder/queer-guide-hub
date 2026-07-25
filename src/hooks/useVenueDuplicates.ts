import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { contentTypeRegistry, getContentType } from '@/config/contentTypes';
import type { DedupCapability } from '@/types/cms';

/**
 * Data + mutations for the registry-driven /admin/duplicates console.
 *
 * Every content type declares its dedup capability once, in its registry
 * `admin.dedup` block (see `DedupCapability`). The generic clusterer
 * `find_duplicate_clusters` is column-generic over `search_documents.entity_type`,
 * and `merge_entities` is generic over `p_type`, so most types need no bespoke
 * code here — this hook just reads the per-type config and dispatches.
 *
 * Merge routing by `cfg.mergePath`: venues → `merge_venues`, cities →
 * `merge_cities`, everything else → the `merge_entities` dispatcher. The dynamic
 * fuzzy finders, `merge_cities`/`merge_entities` (whose generated arg names differ
 * from the DB) go through `untypedRpc`; `find_duplicate_clusters`, `merge_venues`
 * and `unmerge_venues` are in the generated types and called natively.
 *
 * (Filename kept for git history — this is the general dedup hook, not venue-only.)
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

/** A dedup-enabled content type resolved from the registry. */
export interface DedupType {
  /** Registry key, e.g. 'venues'. */
  key: string;
  /** Plural label for the selector, e.g. 'Venues'. */
  label: string;
  cfg: DedupCapability;
}

/** Every content type whose registry `admin.dedup` block is set, in registry order. */
export function useDedupTypes(): DedupType[] {
  return useMemo(
    () =>
      Object.entries(contentTypeRegistry)
        .filter(([, c]) => c.admin?.dedup)
        .map(([key, c]) => ({ key, label: c.label.plural, cfg: c.admin!.dedup! })),
    [],
  );
}

const dedupCfg = (typeKey: string): DedupCapability | undefined =>
  getContentType(typeKey)?.admin?.dedup;

export function useDuplicateClusters(typeKey: string) {
  const cfg = dedupCfg(typeKey);
  const clustersQuery = useQuery({
    queryKey: ['dup-clusters', typeKey],
    enabled: Boolean(cfg),
    queryFn: async (): Promise<Cluster[]> => {
      if (!cfg) return [];
      // Types not in search_documents (e.g. hotels) supply a dedicated finder.
      if (cfg.clusterFinder) {
        const { data, error } = await untypedRpc(cfg.clusterFinder, { p_limit: 200 });
        if (error) throw error;
        return (data ?? []) as unknown as Cluster[];
      }
      const { data, error } = await supabase.rpc('find_duplicate_clusters', {
        p_content_type: cfg.searchType,
        p_limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Cluster[];
    },
  });

  const clusters = useMemo(() => clustersQuery.data ?? [], [clustersQuery.data]);
  const memberIds = useMemo(() => clusters.flatMap((c) => c.members.map((m) => m.id)), [clusters]);

  const metaQuery = useQuery({
    queryKey: ['dup-entity-meta', typeKey, memberIds],
    enabled: Boolean(cfg) && memberIds.length > 0,
    queryFn: async (): Promise<Map<string, VenueMeta>> => {
      const { data, error } = await untypedFrom(cfg!.metaTable)
        .select(cfg!.metaCols)
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

// --- Fuzzy (same-place / same-item) dedup ---------------------------------
// A type's fuzzy finder surfaces near-identical names at effectively the same
// coordinates that the exact name+city grouping misses (word-order swaps,
// punctuation). auto_eligible pairs are what the automated sweep acts on; the
// rest are here for a human to merge.

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
  match_type: string;
  dist_m: number | null;
  auto_eligible: boolean;
  count: number;
  members: FuzzyMember[];
}

export function useFuzzyDuplicateClusters(typeKey: string) {
  const rpc = dedupCfg(typeKey)?.fuzzyRpc;
  const query = useQuery({
    queryKey: ['fuzzy-dup-clusters', typeKey],
    enabled: Boolean(rpc),
    queryFn: async (): Promise<FuzzyCluster[]> => {
      const { data, error } = await untypedRpc(rpc!, { p_limit: 300 });
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

/** Auto-merge the unambiguous same-place pairs via a type's bulk sweep RPC. */
export async function runFuzzyAutomerge(
  rpc: string,
  dryRun: boolean,
): Promise<{
  merged: number;
  eligible_pairs: number;
  skipped: number;
  chains_collapsed: number;
  dry_run: boolean;
}> {
  const { data, error } = await untypedRpc<{
    merged: number;
    eligible_pairs: number;
    skipped: number;
    chains_collapsed: number;
    dry_run: boolean;
  }>(rpc, { p_dry_run: dryRun });
  if (error) throw error;
  return data!;
}

/**
 * Merge one duplicate into the canonical for ANY dedup-enabled content type.
 * Routes by `cfg.mergePath`: venues → dedicated `merge_venues`, cities →
 * `merge_cities`, everything else → the generic `merge_entities` dispatcher.
 * Returns the audit id for undo.
 */
export async function mergeEntityPair(
  typeKey: string,
  keepId: string,
  dropId: string,
): Promise<string | undefined> {
  const cfg = dedupCfg(typeKey);
  if (!cfg) throw new Error(`No dedup config for content type "${typeKey}"`);

  if (cfg.mergePath === 'venue') {
    const { data, error } = await supabase.rpc('merge_venues', {
      p_keep_id: keepId,
      p_drop_id: dropId,
    });
    if (error) throw error;
    return (data as { audit_id?: string } | null)?.audit_id;
  }
  if (cfg.mergePath === 'city') {
    const { data, error } = await untypedRpc('merge_cities', {
      p_keep_id: keepId,
      p_drop_id: dropId,
    });
    if (error) throw error;
    return (data as { audit_id?: string } | null)?.audit_id;
  }
  const { data, error } = await untypedRpc('merge_entities', {
    p_type: cfg.searchType,
    p_keep_id: keepId,
    p_drop_id: dropId,
  });
  if (error) throw error;
  return (data as { audit_id?: string } | null)?.audit_id;
}

/** Reverse a merge by audit id for ANY dedup-enabled content type. */
export async function unmergeEntity(typeKey: string, auditId: string): Promise<void> {
  const cfg = dedupCfg(typeKey);
  if (cfg?.mergePath === 'venue') {
    const { error } = await supabase.rpc('unmerge_venues', { p_audit_id: auditId });
    if (error) throw error;
    return;
  }
  if (cfg?.mergePath === 'city') {
    const { error } = await untypedRpc('unmerge_cities', { p_audit_id: auditId });
    if (error) throw error;
    return;
  }
  const { error } = await untypedRpc('unmerge_entities', { p_audit_id: auditId });
  if (error) throw error;
}
