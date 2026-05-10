import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type PersonalityRow = Database['public']['Tables']['personalities']['Row'];
type _PersonalityInsert = Database['public']['Tables']['personalities']['Insert'];

export interface Personality {
  id: string;
  slug?: string;
  name: string;
  pronouns?: string;
  description?: string;
  bio?: string;
  birth_date?: string;
  death_date?: string;
  is_living: boolean;
  profession?: string;
  fields: string[];
  achievements: string[];
  image_url?: string;
  social_links: Record<string, unknown>;
  website_url?: string;
  nationality?: string;
  birth_place?: string;
  tags: string[];
  verification_status: 'pending' | 'verified' | 'disputed';
  visibility: 'public' | 'private' | 'draft';
  created_by?: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  is_featured: boolean;
}

export type PersonalitySort = 'featured' | 'az' | 'za' | 'popular' | 'newest';

export interface PersonalityFilters {
  search?: string;
  fields?: string[];
  profession?: string;
  verification_status?: string;
  is_living?: boolean;
  featured_only?: boolean;
  exclude_adult?: boolean;
  name_starts_with?: string;
  sortBy?: PersonalitySort;
}

function transformRow(row: PersonalityRow): Personality {
  return {
    ...row,
    name: row.name || '',
    pronouns: row.pronouns || undefined,
    description: row.description || undefined,
    bio: row.bio || undefined,
    birth_date: row.birth_date || undefined,
    death_date: row.death_date || undefined,
    profession: row.profession || undefined,
    image_url: row.image_url || undefined,
    website_url: row.website_url || undefined,
    nationality: row.nationality || undefined,
    birth_place: row.birth_place || undefined,
    created_by: row.created_by || undefined,
    slug: (row as Record<string, unknown>).slug as string || undefined,
    fields: Array.isArray(row.fields) ? (row.fields as string[]) : [],
    achievements: Array.isArray(row.achievements) ? (row.achievements as string[]) : [],
    social_links: (row.social_links as Record<string, unknown>) || {},
    tags: row.tags || [],
    verification_status:
      (row.verification_status as 'pending' | 'verified' | 'disputed') || 'pending',
    visibility: (row.visibility as 'public' | 'private' | 'draft') || 'public',
  };
}

function applyFilters(query: ReturnType<typeof supabase.from>, filters?: PersonalityFilters) {
  if (!filters) return query;

  if (filters.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,profession.ilike.%${filters.search}%`,
    );
  }

  if (filters.profession) {
    query = query.ilike('profession', `%${filters.profession}%`);
  }

  if (filters.fields && filters.fields.length > 0) {
    query = query.contains('fields', filters.fields);
  }

  if (filters.verification_status) {
    query = query.eq('verification_status', filters.verification_status);
  }

  if (filters.is_living !== undefined) {
    query = query.eq('is_living', filters.is_living);
  }

  if (filters.featured_only) {
    query = query.eq('is_featured', true);
  }

  if (filters.exclude_adult !== false) {
    query = query.eq('is_adult', false);
  }

  if (filters.name_starts_with) {
    const v = filters.name_starts_with.toUpperCase();
    if (v === '#') {
      // Anything whose first unaccented character isn't A-Z (digits, symbols, CJK, etc.)
      query = query.filter('name_initial', 'not.in', '(A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z)');
    } else if (v.length === 1 && v >= 'A' && v <= 'Z') {
      query = query.eq('name_initial', v);
    }
  }

  return query;
}

function applySort(query: ReturnType<typeof supabase.from>, sortBy: PersonalitySort = 'featured') {
  // Stable secondary order on `id` keeps pagination deterministic when the
  // primary sort key has ties (very common for view_count / created_at).
  switch (sortBy) {
    case 'az':
      return query.order('name', { ascending: true }).order('id', { ascending: true });
    case 'za':
      return query.order('name', { ascending: false }).order('id', { ascending: true });
    case 'popular':
      return query
        .order('view_count', { ascending: false })
        .order('id', { ascending: true });
    case 'newest':
      return query
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
    case 'featured':
    default:
      return query
        .order('is_featured', { ascending: false })
        .order('view_count', { ascending: false })
        .order('id', { ascending: true });
  }
}

export function usePersonalities(autoFetch: boolean = true) {
  const { user } = useAuth();
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPersonalities = async (
    filters?: PersonalityFilters,
    options?: { page?: number; pageSize?: number; append?: boolean },
  ) => {
    let fetchedCount = 0;
    let totalFromQuery: number | null = null;
    try {
      setLoading(true);
      setError(null);

      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? 24;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('personalities')
        .select('*', { count: 'exact' })
        .eq('visibility', 'public')
        .is('duplicate_of_id', null);

      query = applyFilters(query, filters);
      query = applySort(query, filters?.sortBy);
      query = query.range(from, to);

      const { data, error: queryError, count } = await query;

      if (queryError) {
        setError(queryError.message);
        return { fetched: 0, total: 0 };
      }

      const transformed = (data || []).map(transformRow);

      if (options?.append) {
        setPersonalities((prev) => {
          const merged = [...prev, ...transformed];
          return Array.from(new Map(merged.map((p) => [p.id, p])).values());
        });
      } else {
        setPersonalities(transformed);
      }

      fetchedCount = transformed.length;
      totalFromQuery = typeof count === 'number' ? count : 0;
      setTotalCount(totalFromQuery);
      setHasMore(from + transformed.length < totalFromQuery);
    } catch (err) {
      console.error('Error fetching personalities:', err);
      setError('Failed to load personalities');
    } finally {
      setLoading(false);
    }
    return { fetched: fetchedCount, total: totalFromQuery ?? 0 };
  };

  const createPersonality = async (
    personality: Omit<
      Personality,
      'id' | 'created_at' | 'updated_at' | 'view_count' | 'created_by'
    >,
  ) => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to add a personality',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Route through bulletproof pipeline (staging → normalize → validate → dedup → quality → review → commit).
      const { data, error } = await supabase.functions.invoke('stage-personality', {
        body: {
          personality: {
            ...personality,
            fields: personality.fields as string[],
            achievements: personality.achievements as string[],
            tags: personality.tags,
          },
          source_name: 'admin-manual',
          auto_run: true,
        },
      });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }

      const result = data as { staging_id?: string; pipeline_run_id?: string | null; inserted?: boolean };
      toast({
        title: 'Queued for review',
        description: result.pipeline_run_id
          ? `Personality staged and pipeline started (run ${result.pipeline_run_id.slice(0, 8)}…).`
          : 'Personality staged; pipeline will pick it up on next run.',
      });
      await fetchPersonalities();
    } catch (err) {
      console.error('Unexpected error creating personality:', err);
      toast({
        title: 'Error',
        description: 'Failed to add personality',
        variant: 'destructive',
      });
    }
  };

  const updatePersonality = async (id: string, updates: Partial<Personality>) => {
    try {
      const { error } = await supabase.from('personalities').update(updates).eq('id', id);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }

      toast({ title: 'Success', description: 'Personality updated successfully' });
      await fetchPersonalities();
    } catch (err) {
      console.error('Unexpected error updating personality:', err);
      toast({
        title: 'Error',
        description: 'Failed to update personality',
        variant: 'destructive',
      });
    }
  };

  const incrementViews = useCallback(async (personalityId: string) => {
    try {
      await supabase.rpc('increment_personality_views', {
        personality_id: personalityId,
      });
    } catch (err) {
      console.error('Error incrementing personality views:', err);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchPersonalities();
    }
     
  }, [autoFetch]);

  return {
    personalities,
    totalCount,
    loading,
    error,
    hasMore,
    fetchPersonalities,
    createPersonality,
    updatePersonality,
    incrementViews,
    refetchPersonalities: fetchPersonalities,
  };
}

/**
 * Small one-shot hook for the Featured rail on /personalities.
 * Returns up to `limit` is_featured=true personalities, sorted by view_count.
 */
export function useFeaturedPersonalities(limit: number = 8) {
  const [featured, setFeatured] = useState<Personality[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data, error: queryError } = await supabase
          .from('personalities')
          .select('*')
          .eq('visibility', 'public')
          .eq('is_featured', true)
          .order('view_count', { ascending: false })
          .limit(limit);

        if (cancelled) return;
        if (queryError) {
          setError(queryError.message);
          return;
        }
        setFeatured((data || []).map(transformRow));
      } catch (_err) {
        if (!cancelled) setError('Failed to load featured personalities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { featured, loading, error };
}

export interface ProfessionFacet {
  profession: string;
  count: number;
}

// Module-level cache so facets don't refetch per render across consumers.
let facetCache: { limit: number; data: ProfessionFacet[] } | null = null;

/**
 * Returns top-N professions with counts via the `get_personality_profession_facets` RPC.
 * Falls back to an empty list on failure so the filter bar still renders.
 */
export function useProfessionFacets(limit: number = 15) {
  const [facets, setFacets] = useState<ProfessionFacet[]>(
    facetCache && facetCache.limit >= limit ? facetCache.data.slice(0, limit) : [],
  );
  const [loading, setLoading] = useState(!facetCache || facetCache.limit < limit);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (facetCache && facetCache.limit >= limit) {
      setFacets(facetCache.data.slice(0, limit));
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_personality_profession_facets', {
          lim: Math.max(limit, 20),
        });
        if (!mountedRef.current) return;
        if (error) {
          console.warn('profession facets RPC failed:', error.message);
          setFacets([]);
          return;
        }
        const rows: ProfessionFacet[] = (data || []).map((row: Record<string, unknown>) => ({
          profession: row.profession,
          count: Number(row.cnt ?? row.count ?? 0),
        }));
        facetCache = { limit: Math.max(limit, 20), data: rows };
        setFacets(rows.slice(0, limit));
      } catch (err) {
        console.warn('profession facets fetch failed:', err);
        setFacets([]);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [limit]);

  return { facets, loading };
}
