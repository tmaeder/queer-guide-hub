/**
 * /admin/affiliate — surface-attributed affiliate performance.
 *
 * Reads affiliate_click_summary(p_days): clicks + impressions + CTR grouped
 * by surface × partner × vertical. This is the dimension the project was
 * missing — "which surface earns". Realized-commission reconciliation
 * (Travelpayouts stats API) is a Phase-4 follow-up.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { monoChartPalette, monoChartAxis } from '@/lib/chartPalette';

interface SummaryRow {
  surface: string;
  partner: string;
  vertical: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  last_click: string | null;
}

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export default function AdminAffiliate() {
  const [days, setDays] = useState('30');

  const { data, isLoading, error } = useQuery({
    queryKey: ['affiliate-summary', days],
    queryFn: async (): Promise<SummaryRow[]> => {
      const { data, error } = await untypedSupabase.rpc('affiliate_click_summary', {
        p_days: Number(days),
      });
      if (error) throw error;
      return (data ?? []) as SummaryRow[];
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
    <div className="p-6">
      <AdminPageHeader
        eyebrow="COCKPIT · AFFILIATE"
        title="Affiliate performance"
        subtitle="Travelpayouts clicks attributed by surface. Which part of the product earns."
        actions={
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {error && (
        <p className="text-13 text-destructive">Failed to load affiliate data: {(error as Error).message}</p>
      )}

      {/* Top-line totals */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        <Stat label="Clicks" value={totals.clicks.toLocaleString()} />
        <Stat label="Impressions" value={totals.impressions.toLocaleString()} />
        <Stat label="CTR" value={totals.ctr == null ? '—' : `${(totals.ctr * 100).toFixed(1)}%`} />
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-element border border-border p-4">
      <p className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-headline font-bold tabular-nums">{value}</p>
    </div>
  );
}
