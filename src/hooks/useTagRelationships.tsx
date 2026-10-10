import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface SimilarTag {
  tag_id: string;
  name: string;
  slug: string;
  category: string | null;
  image_url: string | null;
  usage_count: number;
  similarity_score: number;
  relationship_type: string;
  is_adult: boolean;
}

export interface GraphNode {
  id: string;
  name: string;
  category: string | null;
  usage_count: number;
  image_url: string | null;
  slug: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  score: number;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Fetch similar tags for a single tag (used in tag detail sidebar)
 */
export function useSimilarTags(tagId: string | null, limit: number = 10) {
  return useQuery({
    queryKey: ['similar-tags', tagId, limit],
    queryFn: async (): Promise<SimilarTag[]> => {
      if (!tagId) return [];

      const { data, error } = await supabase.rpc('get_similar_tags', {
        p_tag_id: tagId,
        p_limit: limit,
        p_min_score: 0.7,
      } as Record<string, unknown>);

      if (error) {
        console.error('Error fetching similar tags:', error);
        return [];
      }

      // DB returns tag_name/tag_slug — normalize to name/slug
      const raw = (data as unknown as Record<string, unknown>[]) || [];
      return raw.map((r) => ({
        tag_id: r.tag_id as string,
        name: (r.tag_name ?? r.name ?? '') as string,
        slug: (r.tag_slug ?? r.slug ?? '') as string,
        category: (r.category_name ?? r.category ?? null) as string | null,
        image_url: (r.image_url ?? null) as string | null,
        usage_count: (r.usage_count ?? 0) as number,
        similarity_score: (r.similarity_score ?? 0) as number,
        relationship_type: (r.relationship_type ?? '') as string,
        is_adult: r.is_adult === true,
      }));
    },
    enabled: !!tagId,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Fetch full graph data for the graph visualization.
 *
 * Errors from the RPC (e.g. a missing GRANT producing 403) propagate via
 * TanStack Query's `error` channel — callers must render a distinct error
 * state, not silently fall back to "no data" UI.
 */
export function useTagGraph(minScore: number = 0.8, categoryFilter: string | null = null) {
  return useQuery({
    queryKey: ['tag-graph', minScore, categoryFilter],
    queryFn: async (): Promise<GraphData> => {
      const params: Record<string, unknown> = { p_min_score: minScore };
      if (categoryFilter) params.p_category_filter = categoryFilter;

      const { data, error } = await supabase.rpc(
        'get_tag_graph_data',
        params as Record<string, unknown>,
      );

      if (error) {
        throw error;
      }

      const result = data as unknown as GraphData;
      return {
        nodes: result?.nodes || [],
        edges: result?.edges || [],
      };
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Mutation to recompute tag similarities (admin only)
 */
export function useComputeTagSimilarities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('compute_tag_similarities');

      if (error) throw error;
      return data as unknown as {
        success: boolean;
        embedding_relationships: number;
        cooccurrence_relationships: number;
        total_relationships: number;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tag-graph'] });
      queryClient.invalidateQueries({ queryKey: ['similar-tags'] });
      toast({
        title: 'Tag Relationships Computed',
        description: `Found ${data.total_relationships} relationships (${data.embedding_relationships} semantic, ${data.cooccurrence_relationships} co-occurrence)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to compute relationships: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

export interface OntologyTag {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  confidence?: number;
  is_adult: boolean;
}

/**
 * One parent, drawn as a transit line: its own parents are the line's upstream
 * terminus, and the parent's OTHER children are the line's other stops.
 *
 * `stop_total` is the count BEFORE the RPC's 8-stop cap, so the UI can tell a
 * short line from a truncated one. Without it a 31-child parent and a 3-child
 * parent render identically and the overflow is silently dropped.
 */
export interface OntologyLine extends OntologyTag {
  upstream: OntologyTag[];
  stops: OntologyTag[];
  stop_total: number;
}

export interface TagOntologyNetwork {
  lines: OntologyLine[];
  narrower: OntologyTag[];
  related: OntologyTag[];
}

export interface TagReferenceLink {
  source_type: string;
  source_url: string;
}

export interface SubstanceInteraction {
  other_id: string;
  other_slug: string;
  other_name: string;
  status: string;
  severity: number;
  note: string | null;
  source: string;
  source_url: string;
}

/**
 * Everything one substance interacts with, worst first.
 *
 * The RPC does the ordering (`substance_interaction_rank`) rather than the
 * client, so the per-substance band and the full matrix cannot disagree about
 * what "most dangerous" means.
 */
export function useSubstanceInteractions(tagId: string | null) {
  return useQuery({
    queryKey: ['substance-interactions', tagId],
    enabled: !!tagId,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<SubstanceInteraction[]> => {
      if (!tagId) return [];
      const { data, error } = await supabase.rpc('get_substance_interactions', {
        p_tag_id: tagId,
      });
      if (error) throw error;
      return (data ?? []) as SubstanceInteraction[];
    },
  });
}

/**
 * External citations for a tag, from `tag_sources`.
 *
 * The RPC deliberately omits `wikipedia` and `wikidata` rows — those render from
 * `unified_tags.wikipedia_url` / `.wikidata_id` in the same card, and returning
 * them here would print every tag's Wikipedia link twice. It also omits
 * `claim_summary`, so no unverified `source_type='llm'` prose can reach the page;
 * the visible label is derived from the URL's host instead.
 */
export function useTagReferenceLinks(tagId: string | null) {
  return useQuery({
    queryKey: ['tag-reference-links', tagId],
    enabled: !!tagId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TagReferenceLink[]> => {
      if (!tagId) return [];
      const { data, error } = await supabase.rpc('get_tag_reference_links', { p_tag_id: tagId });
      if (error) throw error;
      return (data ?? []) as TagReferenceLink[];
    },
  });
}

/**
 * The governed ontology as a two-hop NETWORK, from `get_tag_ontology_network`.
 *
 * Distinct from useSimilarTags, which reads the raw embedding/co-occurrence
 * pool — that pool was measured display-unclean (~25% precision at its 0.80
 * floor) and is a candidate signal for this ontology, never a display source.
 *
 * It replaced `useTagOntology`, whose flat `broader` list let the renderer draw
 * two parallel parents as consecutive stops on one line. Measured on prod,
 * 184 of the 1,000 tags with a parent have two or more and were publishing
 * that false chain.
 */
export function useTagOntologyNetwork(tagId: string | null) {
  return useQuery({
    queryKey: ['tag-ontology-network', tagId],
    enabled: !!tagId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TagOntologyNetwork> => {
      if (!tagId) return { lines: [], narrower: [], related: [] };
      // `as never` until the next `supabase gen types` run picks the function
      // up — it is created by 99991791570412 and is not in types.ts yet. Same
      // escape hatch as useGeoHygiene's `geo_hygiene_stats`.
      const { data, error } = await supabase.rpc(
        'get_tag_ontology_network' as never,
        {
          p_tag_id: tagId,
        } as never,
      );
      if (error) throw error;
      const o = (data ?? {}) as Partial<TagOntologyNetwork>;
      // Normalise is_adult rather than trusting the key: a response served
      // before the RPC deploys lands here with it absent, and `undefined` reads
      // as "not adult" in Safe mode, i.e. silently unsafe.
      const norm = (list: OntologyTag[] | undefined): OntologyTag[] =>
        (list ?? []).map((t) => ({ ...t, is_adult: t.is_adult === true }));
      return {
        lines: (o.lines ?? []).map((l) => ({
          ...l,
          is_adult: l.is_adult === true,
          upstream: norm(l.upstream),
          stops: norm(l.stops),
          stop_total: Number(l.stop_total ?? 0),
        })),
        narrower: norm(o.narrower),
        related: norm(o.related),
      };
    },
  });
}
