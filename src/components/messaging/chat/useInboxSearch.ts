import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { InboxItem } from '@/hooks/useInboxFeed';
import type { User } from '@supabase/supabase-js';

/**
 * Inbox search: debounced server-side message-body/title search across all of
 * the user's conversations, merged with a client-side filter over the already-
 * loaded feed. Extracted verbatim from MessagingInterface — behavior-preserving.
 */
export function useInboxSearch(items: InboxItem[], user: User | null | undefined) {
  const [search, setSearch] = useState('');
  const [serverResults, setServerResults] = useState<InboxItem[]>([]);

  // Server-side message-body/title search across all the user's conversations
  // (the client filter below only covers the already-loaded feed). Debounced.
  useEffect(() => {
    const q = search.trim();
    if (!user || q.length <= 2) {
      // Intentional reset of the debounced server-search when the query is too
      // short; harmless, not a cascading render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServerResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_inbox', {
        p_user: user.id,
        p_query: q,
        p_limit: 30,
      } as never);
      if (!cancelled) setServerResults((data as InboxItem[]) ?? []);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, user]);

  const visibleItems = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    const clientMatches = items.filter(
      (i) => i.title.toLowerCase().includes(q) || i.preview.toLowerCase().includes(q),
    );
    const seen = new Set(clientMatches.map((i) => i.id));
    return [...clientMatches, ...serverResults.filter((i) => !seen.has(i.id))];
  })();

  return { search, setSearch, visibleItems };
}
