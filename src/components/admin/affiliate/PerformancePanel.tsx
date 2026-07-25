/**
 * Performance tab — surface-attributed clicks/impressions/CTR from
 * affiliate_click_summary(p_days, p_vertical).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { monoChartPalette, monoChartAxis } from '@/lib/chartPalette';
import { Stat } from './Stat';

interface SummaryRow {
  surface: string;
  partner: string;
  vertical: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  last_click: string | null;
}

export function PerformancePanel({ days, vertical }: { days: string; vertical: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['affiliate-summary', days, vertical],
    queryFn: async (): Promise<SummaryRow[]> => {
      const { data, error } = await untypedSupabase.rpc('affiliate_click_summary', {
        p_days: Number(days),
        p_vertical: vertical === 'all' ? null : vertical,
      });
      if (error) throw error;
      return (data ?? []) as SummaryRow[];
    },
  });

  // Shopping monetization coverage: active listings carrying a REAL
  // affiliate_url (the truth backfill clears fake external_url copies, so
  // post-cleanup non-null means monetized).
  const { data: coverage } = useQuery({
    queryKey: ['affiliate-mkt-coverage'],
    queryFn: async () => {
      const base = untypedSupabase.from('marketplace_listings');
      const [{ count: total }, { count: covered }] = await Promise.all([
        base.select('id', { count: 'exact', head: true }).eq('status', 'active'),
        base.select('id', { count: 'exact', head: true }).eq('status', 'active').not('affiliate_url', 'is', null),
      ]);
      return { total: total ?? 0, covered: covered ?? 0 };
    },
  });

  const rows = useMemo(() => data ?? [], [data]);

  const totals = useMemo(() => {
    const clicks = rows.reduce((s, r) => s + Number(r.clicks), 0);
    const impressions = rows.reduce((s, r) => s + Number(r.impressions), 0);
    return { clicks, impressions, ctr: impressions ? clicks / impressions : null };
  }, [rows]);

  const bySurface = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.surface, (map.get(r.surface) ?? 0) + Number(r.clicks));
    return [...map.entries()].map(([surface, clicks]) => ({ surface, clicks })).sort((a, b) => b.clicks - a.clicks);
  }, [rows]);

  const palette = monoChartPalette(Math.max(bySurface.length, 1));

  return (
    <>
      {error && (
        <p className="text-13 text-destructive">Failed to load affiliate data: {(error as Error).message}</p>
      )}

      {/* Top-line totals */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <Stat label="Clicks" value={totals.clicks.toLocaleString()} />
        <Stat label="Impressions" value={totals.impressions.toLocaleString()} />
        <Stat label="CTR" value={totals.ctr == null ? '—' : `${(totals.ctr * 100).toFixed(1)}%`} />
        <Stat
          label="Shopping affiliate coverage"
          value={
            coverage && coverage.total > 0
              ? `${((coverage.covered / coverage.total) * 100).toFixed(0)}% (${coverage.covered.toLocaleString()}/${coverage.total.toLocaleString()})`
              : '—'
          }
        />
      </div>

      {/* Clicks by surface */}
      {bySurface.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-15 font-semibold">Clicks by surface</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySurface} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis type="number" {...monoChartAxis} />
                <YAxis type="category" dataKey="surface" width={96} {...monoChartAxis} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="clicks" radius={[0, 4, 4, 0]}>
                  {bySurface.map((_, i) => (
                    <Cell key={i} fill={palette[i % palette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Detail table */}
      <section>
        <h2 className="mb-4 text-15 font-semibold">Surface × partner × vertical</h2>
        {isLoading ? (
          <p className="text-13 text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-13 text-muted-foreground">No affiliate clicks in this window yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Surface</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Vertical</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Impr.</TableHead>
                <TableHead className="text-right">CTR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.surface}-${r.partner}-${r.vertical}-${i}`}>
                  <TableCell className="font-medium">{r.surface}</TableCell>
                  <TableCell>{r.partner}</TableCell>
                  <TableCell className="text-muted-foreground">{r.vertical}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.clicks).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {Number(r.impressions).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.ctr == null ? '—' : `${(Number(r.ctr) * 100).toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}
