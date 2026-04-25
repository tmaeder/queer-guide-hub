import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
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
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress  aria-label="Loading"/>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' } }}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Volume by category (90d)
        </Typography>
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volumeSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartsTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {feedbackCategories.map((c) => (
                <Area
                  key={c.value}
                  type="monotone"
                  dataKey={c.value}
                  stackId="1"
                  stroke={c.color}
                  fill={c.color}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Status funnel
        </Typography>
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="status" type="category" tick={{ fontSize: 11 }} width={88} />
              <RechartsTooltip />
              <Bar dataKey="n" />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      <Paper sx={{ p: 2, gridColumn: { xs: '1 / -1', md: 'auto' } }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Time to resolve (90d, resolved items only)
        </Typography>
        {sla.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No resolved items yet.
          </Typography>
        ) : (
          <Box
            component="table"
            sx={{
              width: '100%',
              borderCollapse: 'collapse',
              '& th, & td': { textAlign: 'left', fontSize: '0.75rem', py: 0.5, px: 0.75 },
              '& th': { borderBottom: 1, borderColor: 'divider', fontWeight: 600 },
            }}
          >
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
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          bgcolor: cat?.color || '#888',
                          borderRadius: '50%',
                          mr: 1,
                        }}
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
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Top voted
        </Typography>
        {topVoted.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No votes yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {topVoted.map(({ item, votes }) => {
              const cat = feedbackCategoryMap[item.data.category];
              return (
                <Box
                  key={item.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                  <Box
                    sx={{
                      width: 24,
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      color: votes > 0 ? 'primary.main' : 'text.secondary',
                    }}
                  >
                    {votes}
                  </Box>
                  {cat && (
                    <Box
                      component="span"
                      sx={{
                        width: 6,
                        height: 6,
                        bgcolor: cat.color,
                        borderRadius: '50%',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.75rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.data.title}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
