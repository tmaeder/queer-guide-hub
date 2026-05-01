import { useEffect, useState } from 'react';
import { callSearchIntelligence } from './useSearchIntelligence';

export interface PublicCluster {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_featured: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

interface State {
  clusters: PublicCluster[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches active topic clusters (#171 / #225) for the public search-filter
 * picker. Same endpoint the admin Topics tab uses, but constrained to
 * `status='active'` so drafts/archives don't leak.
 *
 * Cached at module level so navigating between pages doesn't refetch in
 * the same tab session — clusters change rarely (editorial bundles
 * curated by admins).
 */
let cache: PublicCluster[] | null = null;

export function useTopicClusters() {
  const [state, setState] = useState<State>({
    clusters: cache ?? [],
    loading: cache === null,
    error: null,
  });

  useEffect(() => {
    if (cache) return;
    let aborted = false;
    (async () => {
      const res = await callSearchIntelligence<PublicCluster[]>('clusters', {
        searchParams: { status: 'active', limit: '100' },
      });
      if (aborted) return;
      if (!res.success) {
        setState({ clusters: [], loading: false, error: res.error });
        return;
      }
      cache = res.data ?? [];
      setState({ clusters: cache, loading: false, error: null });
    })();
    return () => {
      aborted = true;
    };
  }, []);

  return state;
}
