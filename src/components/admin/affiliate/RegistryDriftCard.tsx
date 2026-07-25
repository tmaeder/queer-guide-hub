/**
 * Registry drift observability: compares the /go worker's live partner
 * registry (GET /go/registry — db vs baked-in fallback) against the
 * affiliate_partners go_key rows and the frontend PARTNERS map.
 */

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { Badge } from '@/components/ui/badge';
import { PARTNERS as FRONTEND_PARTNERS } from '@/lib/affiliate/config';

const SEARCH_PROXY_URL = import.meta.env.VITE_SEARCH_PROXY_URL || 'https://search.queer.guide';

interface WorkerRegistry {
  source: 'db' | 'fallback';
  fetchedAt: string;
  keys: string[];
}

export function RegistryDriftCard() {
  const { data: worker } = useQuery({
    queryKey: ['go-registry'],
    queryFn: async (): Promise<WorkerRegistry | null> => {
      const res = await fetch(`${SEARCH_PROXY_URL}/go/registry`);
      if (!res.ok) return null;
      return (await res.json()) as WorkerRegistry;
    },
    staleTime: 60_000,
  });

  const { data: dbKeys } = useQuery({
    queryKey: ['partner-go-keys'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await untypedSupabase
        .from('affiliate_partners')
        .select('go_key')
        .not('go_key', 'is', null)
        .eq('enabled', true);
      if (error) throw error;
      return ((data ?? []) as Array<{ go_key: string }>).map((r) => r.go_key).sort();
    },
  });

  if (!worker) return null;

  const workerKeys = new Set(worker.keys);
  const frontendKeys = Object.keys(FRONTEND_PARTNERS);
  const missingInWorker = frontendKeys.filter((k) => !workerKeys.has(k));
  const dbNotServed = (dbKeys ?? []).filter((k) => !workerKeys.has(k));
  const clean = worker.source === 'db' && missingInWorker.length === 0 && dbNotServed.length === 0;

  return (
    <div className="mb-6 rounded-element border border-border p-4">
      <div className="flex items-center gap-2">
        {clean ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
        <p className="text-13 font-semibold">Worker registry</p>
        <Badge variant="outline">{worker.source === 'db' ? 'DB-driven' : 'fallback map'}</Badge>
        <span className="text-xs text-muted-foreground">
          {worker.keys.length} partners · loaded {new Date(worker.fetchedAt).toLocaleTimeString()}
        </span>
      </div>
      {worker.source === 'fallback' && (
        <p className="mt-2 text-13 text-muted-foreground">
          The /go worker could not load this table and is serving its baked-in map — edits here are not live.
        </p>
      )}
      {missingInWorker.length > 0 && (
        <p className="mt-2 text-13 text-destructive">
          Frontend emits keys the worker doesn't serve: {missingInWorker.join(', ')}
        </p>
      )}
      {dbNotServed.length > 0 && worker.source === 'db' && (
        <p className="mt-2 text-13 text-destructive">
          Enabled go_key rows not served by the worker (cache lag ≤1h): {dbNotServed.join(', ')}
        </p>
      )}
      {clean && (
        <p className="mt-2 text-13 text-muted-foreground">
          This table drives the /go redirect live (≤5 min memo + ≤1 h edge cache).
        </p>
      )}
    </div>
  );
}
