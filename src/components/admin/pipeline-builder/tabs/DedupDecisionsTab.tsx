import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Merge, X, CheckCircle, Wand2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DedupRow {
  id: string;
  entity_type: string;
  entity_a_id: string | null;
  entity_b_id: string | null;
  match_method: string;
  confidence: number;
  decision: string;
  incoming_source_name: string | null;
  incoming_source_id: string | null;
  created_at: string;
}

type EntityFilter = 'all' | 'venue' | 'event' | 'place' | 'stay';

export default function DedupDecisionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');

  const { data: rows = [], isLoading } = useQuery<DedupRow[]>({
    queryKey: ['dedup-decisions', entityFilter],
    queryFn: async () => {
      let q = supabase
        .from('scraper_dedupe_decisions')
        .select('*')
        .eq('decision', 'pending')
        .order('confidence', { ascending: false })
        .limit(200);
      if (entityFilter !== 'all') q = q.eq('entity_type', entityFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DedupRow[];
    },
    refetchInterval: 60_000,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'merge' | 'skip' }) => {
      const { error } = await supabase
        .from('scraper_dedupe_decisions')
        .update({ decision })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dedup-decisions'] }),
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const autoResolve = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('scraper_resolve_pending', {
        p_older_than_days: 30,
        p_confidence_floor: 0.75,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast({ title: `Auto-resolved ${n} decisions` });
      qc.invalidateQueries({ queryKey: ['dedup-decisions'] });
    },
    onError: (e: Error) => toast({ title: 'Auto-resolve failed', description: e.message, variant: 'destructive' }),
  });

  const counts = useMemo(() => {
    const by: Record<string, number> = { all: rows.length };
    for (const r of rows) by[r.entity_type] = (by[r.entity_type] ?? 0) + 1;
    return by;
  }, [rows]);

  const FilterButton = ({ value, label }: { value: EntityFilter; label: string }) => (
    <button
      onClick={() => setEntityFilter(value)}
      className={`text-[11px] px-2.5 py-1 rounded border transition-colors capitalize ${
        entityFilter === value
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-accent'
      }`}
    >
      {label}{counts[value] ? <span className="ml-1 opacity-70">{counts[value]}</span> : null}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Merge className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Pending dedupe decisions</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{counts.all} pending</Badge>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => autoResolve.mutate()}
          disabled={autoResolve.isPending}
        >
          {autoResolve.isPending
            ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
          Auto-resolve {'<'} 0.75 &amp; older than 30d
        </Button>
      </div>

      {/* Entity filter chips */}
      <div className="flex gap-1 flex-wrap">
        <FilterButton value="all" label="all" />
        <FilterButton value="venue" label="venue" />
        <FilterButton value="event" label="event" />
        <FilterButton value="place" label="place" />
        <FilterButton value="stay" label="stay" />
      </div>

      {/* Table */}
      <div className="border border-border rounded-md bg-background overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground text-xs">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 inline mr-1" />
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">No pending decisions — queue is clean</span>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="border-b border-border">
                  {['Type', 'Method', 'Confidence', 'Canonical', 'Incoming', 'Created', 'Actions'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-[11px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const confColor =
                    r.confidence >= 0.85 ? 'text-green-600 dark:text-green-400'
                    : r.confidence >= 0.75 ? 'text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground';
                  return (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{r.entity_type}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.match_method}</td>
                      <td className={`px-3 py-2 font-mono tabular-nums font-semibold ${confColor}`}>
                        {r.confidence.toFixed(3)}
                      </td>
                      <td className="px-3 py-2">
                        <code className="text-[10px] bg-muted/60 px-1 rounded">{r.entity_a_id?.slice(0, 8) ?? '—'}</code>
                      </td>
                      <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground">
                        {r.incoming_source_name}/{r.incoming_source_id}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground"
                          title={new Date(r.created_at).toISOString()}>
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={() => resolve.mutate({ id: r.id, decision: 'merge' })}
                            disabled={resolve.isPending}
                          >
                            <Merge className="h-3 w-3 mr-1" />
                            Merge
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => resolve.mutate({ id: r.id, decision: 'skip' })}
                            disabled={resolve.isPending}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Skip
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
