import { useCallback, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { InboxItem } from '@/hooks/useInboxFeed';
import type { User } from '@supabase/supabase-js';

/**
 * Inbox search: debounced server-side message-body/title search across all of
 * the user's conversations, merged with a client-side filter over the already-
 * loaded feed. Extracted verbatim from MessagingInterface — behavior-preserving.
 */
export function useInboxSearch(
  items: InboxItem[],
  user: User | null | undefined,
  mailOnly = false,
  controlledSearch?: string,
  onControlledSearchChange?: (value: string) => void,
) {
  const userId = user?.id;
  const [internalSearch, setInternalSearch] = useState('');
  const search = controlledSearch ?? internalSearch;
  const setSearch = useCallback(
    (value: string) => {
      if (onControlledSearchChange) onControlledSearchChange(value);
      else setInternalSearch(value);
    },
    [onControlledSearchChange],
  );
  const [result, setResult] = useState<{
    query: string;
    userId: string;
    items: InboxItem[];
    failed: boolean;
  } | null>(null);

  // Server-side message-body/title search across all the user's conversations
  // (the client filter below only covers the already-loaded feed). Debounced.
  useEffect(() => {
    const q = search.trim();
    if (mailOnly || !userId || q.length <= 2) {
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('search_inbox', {
          p_user: userId,
          p_query: q,
          p_limit: 30,
        } as never);
        if (!cancelled)
          setResult({ query: q, userId, items: (data as InboxItem[]) ?? [], failed: !!error });
      } catch {
        if (!cancelled) setResult({ query: q, userId, items: [], failed: true });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, userId, mailOnly]);

  const currentResult =
    result?.query === search.trim() && result?.userId === user?.id ? result : null;
  const searching = !mailOnly && !!user && search.trim().length > 2 && !currentResult;
  const serverResults = mailOnly ? [] : (currentResult?.items ?? []);

  const visibleItems = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    const clientMatches = items.filter(
      (i) => i.title.toLowerCase().includes(q) || i.preview.toLowerCase().includes(q),
    );
    const seen = new Set(clientMatches.map((i) => i.id));
    return [...clientMatches, ...serverResults.filter((i) => !seen.has(i.id))];
  })();

  return {
    search,
    setSearch,
    visibleItems,
    searching,
    searchFailed: currentResult?.failed ?? false,
  };
}
