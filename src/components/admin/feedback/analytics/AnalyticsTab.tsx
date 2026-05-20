import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  useFeedbackDailyVolume,
  useFeedbackSlaStats,
  type DailyVolumeRow,
} from '@/hooks/useFeedbackAnalytics';
import { feedbackCategoryMap, feedbackCategories } from '@/config/feedbackCategories';
import { monoChartPalette } from '@/lib/chartPalette';
import { kanbanColumns, priorityFor } from '../constants';
import type { FeedbackSubmission } from '../types';

interface Props {
  items: FeedbackSubmission[];
  voteCounts: Record<string, { count: number }>;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds < 60 * 60) return `${Math.round(seconds / 60)}m`;
  if (seconds < 60 * 60 * 24) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function buildVolumeSeries(rows: DailyVolumeRow[], days = 90) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const byDay = new Map<string, Record<string, number>>();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { day: 0 as unknown as number });
  }

  for (const r of rows) {
    if (r.content_type !== 'feedback') continue;
    const bucket = byDay.get(r.day);
    if (!bucket) continue;
    const cat = r.category || 'other';
    bucket[cat] = (bucket[cat] ?? 0) + r.n;
  }

  return Array.from(byDay.entries()).map(([day, counts]) => ({ day, ...counts }));
}

export function AnalyticsTab({ items, voteCounts }: Props) {
  const { data: daily = [], isLoading: dailyLoading } = useFeedbackDailyVolume();
  const { data: sla = [], isLoading: slaLoading } = useFeedbackSlaStats(90);

  const volumeSeries = useMemo(() => buildVolumeSeries(daily, 90), [daily]);

  const funnelData = useMemo(
    () =>
      kanbanColumns.map((c) => ({
        status: c.label,
        fill: c.color,
        n: items.filter((it) => !it.is_spam && !it.duplicate_of && it.feedback_status === c.id)
          .length,
      })),
    [items],
  );

  const topVoted = useMemo(() => {
    const activeItems = items.filter((it) => !it.is_spam && !it.duplicate_of);
    return activeItems
      .map((it) => ({ item: it, votes: voteCounts[it.id]?.count ?? 0 }))
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 10);
  }, [items, voteCounts]);

  if (dailyLoading || slaLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-[2fr_1fr]">
      <div className="border border-border rounded-element bg-background p-4">
        <p className="text-sm font-bold mb-2">Volume by category (90d)</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volumeSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartsTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {feedbackCategories.map((c, i) => {
                const tone = monoChartPalette(feedbackCategories.length)[i];
                return (
                  <Area
                    key={c.value}
                    type="monotone"
                    dataKey={c.value}
                    stackId="1"
                    stroke={tone}
                    fill={tone}
                    fillOpacity={0.85}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="border border-border rounded-element bg-background p-4">
        <p className="text-sm font-bold mb-2">Status funnel</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={88} />
              <RechartsTooltip />
              <Bar dataKey="n" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="border border-border rounded-element bg-background p-4 col-span-1 md:col-auto">
        <p className="text-sm font-bold mb-2">Time to resolve (90d, resolved items only)</p>
        {sla.length === 0 ? (
          <p className="text-xs text-muted-foreground">No resolved items yet.</p>
        ) : (
          <table className="w-full border-collapse [&_th]:text-left [&_th]:text-xs [&_th]:py-1 [&_th]:px-1.5 [&_th]:border-b [&_th]:font-semibold [&_td]:text-left [&_td]:text-xs [&_td]:py-1 [&_td]:px-1.5">
            <thead>
              <tr>
                <th>Category</th>
                <th>Priority</th>
                <th>Resolved</th>
                <th>Median</th>
                <th>p95</th>
              </tr>
            </thead>
            <tbody>
              {sla.map((row, i) => {
                const cat = feedbackCategoryMap[row.category];
                const p = priorityFor(row.priority);
                return (
                  <tr key={`${row.category}-${row.priority}-${i}`}>
                    <td>
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ backgroundColor: cat?.color || 'hsl(var(--muted-foreground))' }}
                      />
                      {cat?.label || row.category}
                    </td>
                    <td>{p.short}</td>
                    <td>{row.resolved_n}</td>
                    <td>{formatDuration(row.median_seconds)}</td>
                    <td>{formatDuration(row.p95_seconds)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="border border-border rounded-element bg-background p-4">
        <p className="text-sm font-bold mb-2">Top voted</p>
        {topVoted.length === 0 ? (
          <p className="text-xs text-muted-foreground">No votes yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {topVoted.map(({ item, votes }) => {
              const cat = feedbackCategoryMap[item.data.category];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-1 border-b border-border"
                >
                  <div
                    className="w-6 text-right font-bold text-xs"
                    style={{ color: votes > 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
                  >
                    {votes}
                  </div>
                  {cat && (
                    <span
                      className="rounded-full flex-shrink-0"
                      style={{ width: 6, height: 6, backgroundColor: cat.color }}
                    />
                  )}
                  <span className="text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                    {item.data.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
