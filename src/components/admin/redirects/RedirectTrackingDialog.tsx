import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { readInventoryPages, type InventoryRedirect } from '@/lib/redirects/inventory';
import { referrerHost, summariseVisits, type VisitEvent } from '@/lib/redirects/linkTools';
import { formatDateTime } from '@/lib/format';

export function RedirectTrackingDialog({
  row,
  onClose,
}: {
  row: InventoryRedirect;
  onClose: () => void;
}) {
  const [days, setDays] = useState('30');
  const report = useQuery({
    queryKey: ['redirect-visit-report', row.manualId, days],
    enabled: !!row.manualId,
    queryFn: async ({ signal }) => {
      const since =
        days === 'all' ? null : new Date(Date.now() - Number(days) * 86400000).toISOString();
      return (await readInventoryPages(async (offset) => {
        let query = untypedFrom('redirect_events')
          .select('id,ts,country,referer,status', { count: 'exact' })
          .eq('redirect_id', row.manualId!)
          .order('ts', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + 999);
        if (since) query = query.gte('ts', since);
        const { data, count, error } = await query.abortSignal(signal);
        return { data: data as unknown as Record<string, unknown>[], count, error };
      })) as unknown as VisitEvent[];
    },
  });
  const summaries = useMemo(() => summariseVisits(report.data ?? []), [report.data]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Visit tracking</DialogTitle>
          <DialogDescription>
            {row.source} · Visits through this managed redirect. Campaign tags also appear on the
            destination URL.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-medium tabular-nums">
            {row.clicks?.toLocaleString() ?? '—'} lifetime {row.clicks === 1 ? 'visit' : 'visits'}
          </p>
          <select
            aria-label="Tracking date range"
            className="rounded-element border bg-background p-2 text-sm"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All recorded visits</option>
          </select>
        </div>
        {report.isPending && <p role="status">Loading visit report…</p>}
        {report.isError && (
          <div role="alert">
            <p className="text-destructive">
              Could not load visit tracking. {report.error.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => void report.refetch()}>
              Retry report
            </Button>
          </div>
        )}
        {report.data && (
          <>
            <p className="text-sm tabular-nums">
              {report.data.length.toLocaleString()} {report.data.length === 1 ? 'visit' : 'visits'}{' '}
              in this range · Daily totals use UTC.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['Daily visits (latest 10 days)', summaries.daily],
                ['Countries (top 10)', summaries.countries],
                ['Referrers (top 10)', summaries.referrers],
              ].map(([title, entries]) => (
                <section key={String(title)}>
                  <h3 className="mb-2 font-medium">{String(title)}</h3>
                  <ul className="space-y-2 text-xs">
                    {(entries as [string, number][]).slice(0, 10).map(([label, count]) => (
                      <li key={label} className="flex justify-between gap-2">
                        <span className="break-all">{label}</span>
                        <span className="tabular-nums">{count.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            {report.data.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="py-2 text-left font-medium">Most recent 25 visits</caption>
                  <thead>
                    <tr>
                      <th className="p-2 text-left">When</th>
                      <th className="p-2 text-left">Country</th>
                      <th className="p-2 text-left">Referrer</th>
                      <th className="p-2 text-left">HTTP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.slice(0, 25).map((event) => (
                      <tr key={event.id}>
                        <td className="whitespace-nowrap p-2">{formatDateTime(event.ts)}</td>
                        <td className="p-2">{event.country ?? 'Unknown'}</td>
                        <td className="break-all p-2">{referrerHost(event.referer)}</td>
                        <td className="p-2">{event.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground">No recorded visits in this range.</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
