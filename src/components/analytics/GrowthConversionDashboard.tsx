/**
 * Growth & Conversion — the third tab on /admin/analytics.
 *
 * Ties together event data that already exists but was never connected into a
 * funnel: Umami page views (site-wide, top of funnel) -> first-party saves
 * (favorite join tables) -> trip adds (user_activity_events) -> affiliate
 * booking clicks (affiliate_clicks). Plus an affiliate clicks/CTR time-series
 * (the trend /admin/affiliate lacks) and a search-conversion KPI that links to
 * the existing search-intelligence dashboard.
 *
 * Backed by growth_funnel_summary + affiliate_revenue_trend RPCs (admin-gated).
 * The view stage comes from the umami-dashboard edge fn; search KPIs from the
 * search-intelligence edge fn (both already used elsewhere). All read-only.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { monoChartPalette, monoChartAxis, monoChartGrid, monoChartStroke } from '@/lib/chartPalette';
import { callSearchIntelligence, type AnalyticsSummary } from '@/hooks/useSearchIntelligence';

interface FunnelSummary {
  window_days: number;
  saves: number;
  trip_adds: number;
  booking_clicks: number;
  impressions: number;
  save_to_trip_pct: number | null;
  trip_to_booking_pct: number | null;
  affiliate_ctr_pct: number | null;
}

interface TrendRow {
  bucket: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
}

interface CohortRow {
  cohort_week: string;
  week_offset: number;
  users: number;
  retained: number;
}

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export function GrowthConversionDashboard() {
  const [days, setDays] = useState('30');

  const funnel = useQuery({
    queryKey: ['growth-funnel', days],
    queryFn: async (): Promise<FunnelSummary> => {
      const { data, error } = await untypedSupabase.rpc('growth_funnel_summary', { p_days: Number(days) });
      if (error) throw error;
      return data as FunnelSummary;
    },
  });

  const trend = useQuery({
    queryKey: ['affiliate-trend', days],
    queryFn: async (): Promise<TrendRow[]> => {
      const { data, error } = await untypedSupabase.rpc('affiliate_revenue_trend', {
        p_days: Number(days),
        p_bucket: 'day',
      });
      if (error) throw error;
      return (data ?? []) as TrendRow[];
    },
  });

  // View stage — site-wide Umami page views (not joinable to first-party events).
  const views = useQuery({
    queryKey: ['growth-views', days],
    queryFn: async (): Promise<number | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('umami-dashboard', {
        body: { action: 'get_enhanced_stats', dateRange: `${days}d`, deviceFilter: 'all', countryFilter: 'all' },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) return null;
      const v = (data as { totalPageViews?: number } | null)?.totalPageViews;
      return typeof v === 'number' ? v : null;
    },
  });

  const search = useQuery({
    queryKey: ['growth-search', days],
    queryFn: async (): Promise<AnalyticsSummary | null> => {
      const res = await callSearchIntelligence<AnalyticsSummary>('analytics/summary', {
        searchParams: { since: `${days}d` },
      });
      return res.success ? res.data : null;
    },
  });

  // Weekly retention cohorts — independent of the day window (cohorts are weekly).
  const cohorts = useQuery({
    queryKey: ['growth-cohorts'],
    queryFn: async (): Promise<CohortRow[]> => {
      const { data, error } = await untypedSupabase.rpc('engagement_cohort_retention', { p_weeks: 8 });
      if (error) throw error;
      return (data ?? []) as CohortRow[];
    },
  });

  const cohortGrid = useMemo(() => buildCohortGrid(cohorts.data ?? []), [cohorts.data]);

  const f = funnel.data;

  const funnelBars = useMemo(() => {
    if (!f) return [];
    return [
      { stage: 'Views *', value: views.data ?? 0 },
      { stage: 'Saves', value: f.saves },
      { stage: 'Trip adds', value: f.trip_adds },
      { stage: 'Booking clicks', value: f.booking_clicks },
    ];
  }, [f, views.data]);

  const palette = monoChartPalette(Math.max(funnelBars.length, 1));
  const viewToSavePct = f && views.data ? round1((100 * f.saves) / views.data) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <p className="text-13 text-muted-foreground">
          How engagement converts toward a booking. First-party events except the view stage.
        </p>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {funnel.error && (
        <p className="text-13 text-destructive">Failed to load funnel: {(funnel.error as Error).message}</p>
      )}

      {/* Funnel */}
      <section className="flex flex-col gap-4">
        <h2 className="text-15 font-semibold">Conversion funnel</h2>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="View → Save" value={pct(viewToSavePct)} sub="site-wide *" />
          <Stat label="Save → Trip add" value={pct(f?.save_to_trip_pct ?? null)} />
          <Stat label="Trip → Booking click" value={pct(f?.trip_to_booking_pct ?? null)} />
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelBars} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
              <XAxis type="number" {...monoChartAxis} />
              <YAxis type="category" dataKey="stage" width={104} {...monoChartAxis} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {funnelBars.map((_, i) => (
                  <Cell key={i} fill={palette[i % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-2xs text-muted-foreground">
          * Views are site-wide Umami page views and cannot be joined to first-party events; treat View → Save as directional only.
        </p>
      </section>

      {/* Affiliate clicks / CTR trend */}
      <section className="flex flex-col gap-4">
        <h2 className="text-15 font-semibold">Affiliate clicks &amp; CTR over time</h2>
        {trend.isLoading ? (
          <p className="text-13 text-muted-foreground">Loading…</p>
        ) : (trend.data?.length ?? 0) === 0 ? (
          <p className="text-13 text-muted-foreground">No affiliate clicks in this window yet.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend.data} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid {...monoChartGrid} />
                <XAxis dataKey="bucket" {...monoChartAxis} />
                <YAxis yAxisId="left" {...monoChartAxis} />
                <YAxis yAxisId="right" orientation="right" unit="%" {...monoChartAxis} />
                <Tooltip />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="clicks"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={2}
                  dot={false}
                  name="Clicks"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="ctr"
                  stroke="hsl(var(--foreground) / 0.5)"
                  strokeWidth={2}
                  strokeDasharray={monoChartStroke(1)}
                  dot={false}
                  name="CTR %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Engagement retention cohorts */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-15 font-semibold">Weekly retention cohorts</h2>
          <p className="text-13 text-muted-foreground">
            Of users whose first activity fell in a given week, the share still active N weeks later.
          </p>
        </div>
        {cohorts.isLoading ? (
          <p className="text-13 text-muted-foreground">Loading…</p>
        ) : cohortGrid.rows.length === 0 ? (
          <p className="text-13 text-muted-foreground">Not enough activity history yet.</p>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="border-collapse text-13">
              <thead>
                <tr>
                  <th className="p-2 text-left font-medium text-muted-foreground">Cohort week</th>
                  <th className="p-2 text-right font-medium text-muted-foreground">Users</th>
                  {cohortGrid.offsets.map((o) => (
                    <th key={o} className="p-2 text-center font-medium text-muted-foreground tabular-nums">
                      W{o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortGrid.rows.map((r) => (
                  <tr key={r.cohortWeek}>
                    <td className="p-2 whitespace-nowrap tabular-nums">{r.cohortWeek}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{r.users}</td>
                    {cohortGrid.offsets.map((o) => {
                      const cell = r.cells[o];
                      if (cell == null) return <td key={o} className="p-2" />;
                      return (
                        <td key={o} className="p-1 text-center">
                          <span
                            className="inline-block min-w-[3rem] rounded-badge px-2 py-1 tabular-nums"
                            style={{
                              backgroundColor: `hsl(var(--foreground) / ${(0.08 + 0.8 * cell).toFixed(3)})`,
                              color: cell > 0.5 ? 'hsl(var(--background))' : 'hsl(var(--foreground))',
                            }}
                          >
                            {Math.round(cell * 100)}%
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Search conversion KPI → links to existing dashboard */}
      <section className="flex flex-col gap-4">
        <h2 className="text-15 font-semibold">Search conversion</h2>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Search CTR" value={pct(search.data?.ctr_pct ?? null)} />
          <Stat label="Zero-result rate" value={pct(search.data?.zero_pct ?? null)} tone={(search.data?.zero_pct ?? 0) > 5 ? 'warn' : undefined} />
          <Stat label="Searches" value={search.data ? search.data.total.toLocaleString() : '—'} sub={search.data ? `${search.data.distinct_q} distinct` : undefined} />
        </div>
        <Link
          to="/admin/search-intelligence?tab=analytics"
          className="inline-flex items-center gap-1 text-13 font-medium no-underline hover:underline"
        >
          View search intelligence <ArrowRight size={14} />
        </Link>
      </section>
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface CohortGridRow {
  cohortWeek: string;
  users: number;
  cells: Record<number, number>; // week_offset -> retention fraction 0..1
}

/** Pivot flat cohort rows into a matrix: cohort week × week-offset retention fraction. */
function buildCohortGrid(rows: CohortRow[]): { offsets: number[]; rows: CohortGridRow[] } {
  const byWeek = new Map<string, CohortGridRow>();
  const offsetSet = new Set<number>();
  for (const r of rows) {
    offsetSet.add(r.week_offset);
    let row = byWeek.get(r.cohort_week);
    if (!row) {
      row = { cohortWeek: r.cohort_week, users: r.users, cells: {} };
      byWeek.set(r.cohort_week, row);
    }
    row.users = Math.max(row.users, r.users);
    row.cells[r.week_offset] = r.users > 0 ? r.retained / r.users : 0;
  }
  const offsets = [...offsetSet].sort((a, b) => a - b);
  const grid = [...byWeek.values()].sort((a, b) => (a.cohortWeek < b.cohortWeek ? 1 : -1));
  return { offsets, rows: grid };
}

function pct(v: number | null): string {
  return v == null ? '—' : `${v}%`;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="rounded-element border border-border p-4">
      <p className="text-2xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-headline font-bold tabular-nums ${tone === 'warn' ? 'text-destructive' : ''}`}>{value}</p>
      {sub && <p className="mt-1 text-2xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
