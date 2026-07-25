/**
 * Revenue tab — realized commissions from affiliate_conversions
 * (affiliate_revenue_summary + affiliate_funnel_summary RPCs), per-network
 * pull triggers, and the Amazon CSV import (Amazon has no earnings API).
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download, Upload, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { monoChartPalette, monoChartAxis } from '@/lib/chartPalette';
import { Stat } from './Stat';

interface FunnelRow {
  surface: string;
  partner: string;
  clicks: number;
  conversions: number;
  conv_rate: number | null;
  commission_pending_usd: number;
  commission_confirmed_usd: number;
  unmatched_conversions: number;
}

const NETWORKS = ['awin', 'travelpayouts'] as const;

export function RevenuePanel({ days }: { days: string }) {
  const queryClient = useQueryClient();
  const [pulling, setPulling] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);

  const { data: funnel, isLoading, error } = useQuery({
    queryKey: ['affiliate-funnel', days],
    queryFn: async (): Promise<FunnelRow[]> => {
      const { data, error } = await untypedSupabase.rpc('affiliate_funnel_summary', { p_days: Number(days) });
      if (error) throw error;
      return (data ?? []) as FunnelRow[];
    },
  });

  const rows = useMemo(() => funnel ?? [], [funnel]);

  const totals = useMemo(() => {
    const clicks = rows.reduce((s, r) => s + Number(r.clicks), 0);
    const conversions = rows.reduce((s, r) => s + Number(r.conversions), 0);
    const pending = rows.reduce((s, r) => s + Number(r.commission_pending_usd), 0);
    const confirmed = rows.reduce((s, r) => s + Number(r.commission_confirmed_usd), 0);
    const unmatched = rows.reduce((s, r) => s + Number(r.unmatched_conversions), 0);
    return { clicks, conversions, rate: clicks ? conversions / clicks : null, pending, confirmed, unmatched };
  }, [rows]);

  const bySurface = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const usd = Number(r.commission_pending_usd) + Number(r.commission_confirmed_usd);
      if (usd > 0) map.set(r.surface, (map.get(r.surface) ?? 0) + usd);
    }
    return [...map.entries()].map(([surface, usd]) => ({ surface, usd })).sort((a, b) => b.usd - a.usd);
  }, [rows]);

  const palette = monoChartPalette(Math.max(bySurface.length, 1));

  const pullNow = async (network: string) => {
    setPulling(network);
    try {
      const { data, error } = await supabase.functions.invoke('affiliate-conversions-sync', {
        body: { network },
      });
      if (error) throw error;
      const r = data?.results?.[network] as Record<string, unknown> | undefined;
      if (r?.skipped === 'no_credentials') {
        toast.info(`${network}: API token not configured yet — set the secret first.`);
      } else if (r?.error) {
        toast.error(`${network}: ${String(r.error)}`);
      } else {
        toast.success(`${network}: ${Number(r?.fetched ?? 0)} transactions, ${Number(r?.matched ?? 0)} matched to clicks`);
      }
      queryClient.invalidateQueries({ queryKey: ['affiliate-funnel'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Pull failed');
    } finally {
      setPulling(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-15 font-semibold">Realized revenue</h2>
        <div className="flex gap-2">
          {NETWORKS.map((n) => (
            <Button key={n} variant="outline" onClick={() => pullNow(n)} disabled={pulling !== null}>
              <Download className="w-4 h-4 mr-2" />
              {pulling === n ? 'Pulling…' : `Pull ${n}`}
            </Button>
          ))}
          <Button variant="outline" onClick={() => setCsvOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Amazon CSV
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-13 text-destructive">Failed to load revenue data: {(error as Error).message}</p>
      )}

      <div className="mb-8 grid grid-cols-5 gap-4">
        <Stat label="Clicks" value={totals.clicks.toLocaleString()} />
        <Stat label="Conversions" value={totals.conversions.toLocaleString()} />
        <Stat label="Conv. rate" value={totals.rate == null ? '—' : `${(totals.rate * 100).toFixed(2)}%`} />
        <Stat label="Commission pending" value={`$${totals.pending.toFixed(2)}`} />
        <Stat label="Commission confirmed" value={`$${totals.confirmed.toFixed(2)}`} hint="approved + paid" />
      </div>

      {totals.unmatched > 0 && (
        <div className="mb-8 flex items-start gap-2 rounded-element border border-border p-4">
          <AlertCircle className="mt-0.5 w-4 h-4 shrink-0" />
          <p className="text-13">
            <span className="font-semibold">{totals.unmatched} conversions carry a click code but matched no click row.</span>{' '}
            That usually means clickref/sub_id is being mutated in transit — check the network's tracking settings.
          </p>
        </div>
      )}

      {bySurface.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-15 font-semibold">Commission by surface (USD)</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySurface} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" {...monoChartAxis} />
                <YAxis type="category" dataKey="surface" width={96} {...monoChartAxis} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="usd" radius={[0, 4, 4, 0]}>
                  {bySurface.map((_, i) => (
                    <Cell key={i} fill={palette[i % palette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-15 font-semibold">Funnel: surface × partner</h2>
        {isLoading ? (
          <p className="text-13 text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-13 text-muted-foreground">
            No data yet. Conversions appear after the first network pull (needs API tokens configured).
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Surface</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Confirmed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.surface}-${r.partner}-${i}`}>
                  <TableCell className="font-medium">{r.surface}</TableCell>
                  <TableCell>{r.partner}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.clicks).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.conversions).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.conv_rate == null ? '—' : `${(Number(r.conv_rate) * 100).toFixed(2)}%`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    ${Number(r.commission_pending_usd).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ${Number(r.commission_confirmed_usd).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <AmazonCsvDialog open={csvOpen} onOpenChange={setCsvOpen} onImported={() => queryClient.invalidateQueries({ queryKey: ['affiliate-funnel'] })} />
    </div>
  );
}

/**
 * Amazon Associates has no earnings API — paste the fee-report CSV
 * (order id, date, commission) and import via admin_import_amazon_conversions.
 */
function AmazonCsvDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      toast.error('Paste a CSV with a header row and at least one data row');
      return;
    }
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'));
    const col = (names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
    const iOrder = col(['order_id', 'order']);
    const iDate = col(['date', 'shipped']);
    const iFee = col(['fee', 'commission', 'earnings']);
    const iSale = col(['revenue', 'price', 'sale']);
    const iSub = col(['tracking', 'sub', 'tag']);
    if (iOrder < 0 || iFee < 0) {
      toast.error('Could not find order-id and commission/fee columns in the header');
      return;
    }
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      return {
        order_id: cells[iOrder],
        transaction_time: iDate >= 0 ? cells[iDate] : null,
        commission_amount: cells[iFee]?.replace(/[^0-9.-]/g, ''),
        sale_amount: iSale >= 0 ? cells[iSale]?.replace(/[^0-9.-]/g, '') : null,
        sub_id: iSub >= 0 ? cells[iSub] : null,
        currency: 'USD',
      };
    }).filter((r) => r.order_id);

    setImporting(true);
    try {
      const { data, error } = await untypedSupabase.rpc('admin_import_amazon_conversions', { p_rows: rows });
      if (error) throw error;
      toast.success(`Imported ${(data as { upserted?: number })?.upserted ?? rows.length} Amazon conversions`);
      setCsv('');
      onOpenChange(false);
      onImported();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Amazon earnings CSV</DialogTitle>
          <DialogDescription>
            Amazon Associates has no earnings API. Export the fee report and paste it here — rows upsert on
            order id, so re-importing is safe.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          placeholder={'order_id,date,fee,revenue,tracking_id\n123-4567,2026-07-01,1.23,24.99,queerguide-21'}
          className="font-mono text-xs"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={importing || !csv.trim()}>
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
