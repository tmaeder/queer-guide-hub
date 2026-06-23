import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TagSearchResult {
  id: string;
  name: string;
  slug: string | null;
}

export function useTagSearch() {
  const [results, setResults] = useState<TagSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('unified_tags')
        .select('id, name, slug')
        .ilike('name', `%${q}%`)
        .eq('is_active', true)
        .limit(10);
      setResults((data as TagSearchResult[]) ?? []);
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => setResults([]), []);

  return { results, loading, search, clear };
}
