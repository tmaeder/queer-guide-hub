import { useQuery } from '@tanstack/react-query';
import edgeRules from '../../public/_redirects?raw';
import routeSource from '../routes.tsx?raw';
import { untypedFrom } from '@/integrations/supabase/untyped';
import {
  loadDatabaseInventory,
  parseClientRedirects,
  parseStaticRedirects,
  readInventoryPages,
  type ReadInventoryRows,
} from '@/lib/redirects/inventory';

export const STATIC_REDIRECT_INVENTORY = [
  ...parseStaticRedirects(edgeRules),
  ...parseClientRedirects(routeSource),
];

export function useRedirectInventory() {
  return useQuery({
    // The existing CMS editor/import invalidations refresh the manual records here too.
    queryKey: ['cms-content-list', 'redirect-inventory'],
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const read: ReadInventoryRows = (table, select, order, ids) =>
        readInventoryPages(async (offset) => {
          let query = untypedFrom(table)
            .select(select, { count: 'exact' })
            .order(order)
            .range(offset, offset + 999);
          if (ids) query = query.in(ids.column, ids.values);
          const result = await query.abortSignal(signal);
          return {
            data: result.data as Record<string, unknown>[] | null,
            count: result.count,
            error: result.error,
          };
        });
      const result = await loadDatabaseInventory(read);
      if (signal.aborted) throw new Error('Redirect loading cancelled');
      return { rows: [...result.rows, ...STATIC_REDIRECT_INVENTORY], errors: result.errors };
    },
  });
}
