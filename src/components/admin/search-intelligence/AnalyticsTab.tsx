import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  callSearchIntelligence,
  AnalyticsSummary,
  AnalyticsTopQuery,
  AnalyticsZeroResult,
} from '@/hooks/useSearchIntelligence';

const RANGES: Array<{ value: string; label: string }> = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const tnum = { fontFeatureSettings: '"tnum"' } as const;

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warn' | 'muted';
}) {
  return (
    <Card>
      <CardContent>
        <span className="text-xs text-muted-foreground block">{label}</span>
        <h3
          className="text-3xl mt-1"
          style={{
            ...tnum,
            color: tone === 'warn' ? 'hsl(var(--destructive))' : undefined,
          }}
        >
          {value}
        </h3>
        {sub && <span className="text-xs text-muted-foreground block mt-1">{sub}</span>}
      </CardContent>
    </Card>
  );
}

export function AnalyticsTab() {
  const [range, setRange] = useState('7d');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [top, setTop] = useState<AnalyticsTopQuery[]>([]);
  const [zero, setZero] = useState<AnalyticsZeroResult[]>([]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const params = { since: range };
    const [s, t, z] = await Promise.all([
      callSearchIntelligence<AnalyticsSummary>('analytics/summary', { searchParams: params }),
      callSearchIntelligence<AnalyticsTopQuery[]>('analytics/top-queries', {
        searchParams: { ...params, limit: '50' },
      }),
      callSearchIntelligence<AnalyticsZeroResult[]>('analytics/zero-results', {
        searchParams: { ...params, limit: '50' },
      }),
    ]);
    if (!s.success) {
      setError(s.error);
      setBusy(false);
      return;
    }
    setSummary(s.data);
    setTop(t.success ? (t.data ?? []) : []);
    setZero(z.success ? (z.data ?? []) : []);
    setBusy(false);
  }, [range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          User search activity from the live Postgres engine ({summary?.total ?? 0} searches,{' '}
          {summary?.distinct_q ?? 0} distinct).
        </p>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-destructive">{error}</p>}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Kpi label="Searches" value={String(summary.total)} sub={`${summary.distinct_q} distinct`} />
          <Kpi
            label="Zero-result"
            value={`${summary.zero_pct}%`}
            sub={`${summary.zero_result} searches`}
            tone={summary.zero_pct > 5 ? 'warn' : undefined}
          />
          <Kpi
            label="p95 latency"
            value={summary.p95_ms != null ? `${summary.p95_ms}ms` : '—'}
            sub={summary.p50_ms != null ? `p50 ${summary.p50_ms}ms` : undefined}
            tone={summary.p95_ms != null && summary.p95_ms > 1000 ? 'warn' : undefined}
          />
          <Kpi label="Rewritten" value={`${summary.rewrite_pct}%`} sub={`${summary.rewritten} via synonyms`} />
          <Kpi label="CTR" value="—" sub="click-logging not wired" tone="muted" />
          <Kpi
            label="Top language"
            value={summary.langs[0]?.lang ?? '—'}
            sub={summary.langs[0] ? `${summary.langs[0].n} searches` : undefined}
          />
        </div>
      )}

      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <h6 className="text-lg font-semibold">Zero-result queries</h6>
            <Badge variant={zero.length ? 'destructive' : 'secondary'}>{zero.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Searches that returned nothing — candidates for synonyms or content gaps.
          </p>
          {busy && !zero.length ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : zero.length === 0 ? (
            <p className="text-sm text-muted-foreground">No zero-result queries in this window.</p>
          ) : (
            <div className="flex flex-col divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
              {zero.map((z) => (
                <div key={z.query_normalized} className="flex items-center gap-4 py-2">
                  <span className="flex-1 text-sm font-medium">{z.query_normalized}</span>
                  {z.lang && (
                    <Badge variant="outline" className="uppercase">
                      {z.lang}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground min-w-[60px] text-right" style={tnum}>
                    {z.n}×
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h6 className="text-lg font-semibold mb-4">Top queries</h6>
          {busy && !top.length ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : top.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queries in this window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="font-medium py-2">Query</th>
                    <th className="font-medium py-2 text-right">Count</th>
                    <th className="font-medium py-2 text-right">Avg results</th>
                    <th className="font-medium py-2 text-right">Avg ms</th>
                    <th className="font-medium py-2 text-right">Zero</th>
                    <th className="font-medium py-2 text-center">Lang</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
                  {top.map((q) => (
                    <tr key={q.query_normalized}>
                      <td className="py-2 font-medium">{q.query_normalized}</td>
                      <td className="py-2 text-right" style={tnum}>{q.n}</td>
                      <td className="py-2 text-right" style={tnum}>{q.avg_results}</td>
                      <td
                        className="py-2 text-right"
                        style={{ ...tnum, color: q.avg_ms > 1000 ? 'hsl(var(--destructive))' : undefined }}
                      >
                        {q.avg_ms}
                      </td>
                      <td
                        className="py-2 text-right"
                        style={{ ...tnum, color: q.zero_n > 0 ? 'hsl(var(--destructive))' : undefined }}
                      >
                        {q.zero_n}
                      </td>
                      <td className="py-2 text-center text-xs uppercase text-muted-foreground">{q.lang}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
