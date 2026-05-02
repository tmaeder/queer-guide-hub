/**
 * CMSOverview — Dashboard overview panel.
 * Shows content counts per type, recent activity, quick actions,
 * personalized greeting, skeleton loading, and visual flair.
 */

import { useEffect, useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Skeleton from '@mui/material/Skeleton';
import { alpha } from '@mui/material/styles';
import {
  Plus,
  TrendingUp,
  Clock,
  AlertCircle,
  BarChart3,
  FileText,
  Image,
  ClipboardCheck,
  History,
  ArrowRight,
  MapPin,
  Calendar,
  Newspaper,
  Layers,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getContentTypeIds, getContentType } from '@/config/contentTypeRegistry';
import type { CMSView } from './CMSSidebar';

interface CMSOverviewProps {
  onNavigate: (view: CMSView, contentType?: string) => void;
  onEdit: (contentType: string, itemId: string | null) => void;
}

interface ContentCount {
  id: string;
  label: string;
  count: number;
  color: string;
  icon: React.ElementType;
}

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  source_table: string | null;
  source_id: string | null;
  timestamp: string;
  actorEmail?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function getFirstName(email: string | undefined): string {
  if (!email) return '';
  const prefix = email.split('@')[0];
  // Turn "tobias.maeder" or "tobias_maeder" into "Tobias"
  const name = prefix.split(/[._-]/)[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getActionColor(action: string): string {
  if (action.includes('create') || action.includes('insert')) return '#10b981';
  if (action.includes('update') || action.includes('edit')) return '#3b82f6';
  if (action.includes('delete') || action.includes('remove')) return '#ef4444';
  if (action.includes('publish')) return 'hsl(var(--brand))';
  return '#6b7280';
}

// ── Stat card colors ────────────────────────────────────────────────

const STAT_CARDS = [
  { key: 'total', label: 'Total Items', icon: TrendingUp, color: '#3b82f6' },
  { key: 'review', label: 'In Review', icon: Clock, color: '#f59e0b' },
  { key: 'types', label: 'Content Types', icon: Layers, color: 'hsl(var(--brand))' },
  { key: 'queue', label: 'Review Queue', color: '#10b981', icon: AlertCircle },
] as const;

// ── Skeleton loader ─────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <Box>
      {/* Header skeleton */}
      <Box sx={{ mb: 3 }}>
        <Skeleton variant="text" width={260} height={36} />
        <Skeleton variant="text" width={320} height={20} sx={{ mt: 0.5 }} />
      </Box>

      {/* Stat cards skeleton */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 6, sm: 3 }}>
            <Paper
              sx={{
                p: 2.5,
                borderRadius: 2,
                borderLeft: '3px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Skeleton variant="circular" width={36} height={36} />
                <Skeleton variant="text" width={70} height={16} />
              </Box>
              <Skeleton variant="text" width={60} height={32} />
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Content type cards skeleton */}
      <Skeleton variant="text" width={140} height={24} sx={{ mb: 1.5 }} />
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Grid key={i} size={{ xs: 6, sm: 4, md: 3 }}>
            <Paper sx={{ p: 2, borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Skeleton variant="circular" width={28} height={28} />
                <Skeleton variant="text" width={80} height={18} />
              </Box>
              <Skeleton variant="text" width={50} height={28} sx={{ mb: 1.5 }} />
              <Skeleton variant="rectangular" width="100%" height={4} sx={{ borderRadius: 1 }} />
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Recent activity skeleton */}
      <Skeleton variant="text" width={140} height={24} sx={{ mb: 1.5 }} />
      <Paper sx={{ p: 2, borderRadius: 2 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5 }}>
            <Skeleton variant="circular" width={8} height={8} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="60%" height={18} />
              <Skeleton variant="text" width="30%" height={14} />
            </Box>
            <Skeleton variant="text" width={60} height={14} />
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function CMSOverview({ onNavigate, onEdit }: CMSOverviewProps) {
  const { user } = useAuth();
  const [counts, setCounts] = useState<ContentCount[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<AuditEntry[]>([]);

  const contentTypeIds = useMemo(
    () => getContentTypeIds().filter((id) => id !== 'cms_pages'),
    [],
  );

  const firstName = useMemo(() => getFirstName(user?.email), [user?.email]);

  useEffect(() => {
    loadCounts();
    loadRecentActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  async function loadCounts() {
    setLoading(true);
    try {
      const results: ContentCount[] = [];

      for (const id of contentTypeIds) {
        const config = getContentType(id);
        if (!config) continue;

        const { count } = await supabase
          .from(config.tableName as 'events')
          .select('*', { count: 'exact', head: true });

        results.push({
          id: config.id,
          label: config.label.plural,
          count: count ?? 0,
          color: config.color,
          icon: config.icon,
        });
      }

      // Pages count
      const { count: pagesCount } = await supabase
        .from('cms_pages' as 'events')
        .select('*', { count: 'exact', head: true });

      const pagesConfig = getContentType('cms_pages');
      if (pagesConfig) {
        results.push({
          id: 'cms_pages',
          label: 'Pages',
          count: pagesCount ?? 0,
          color: pagesConfig.color,
          icon: pagesConfig.icon,
        });
      }

      // Review queue count
      const { count: revCount } = await supabase
        .from('cms_content_metadata' as 'events')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_state', 'review');

      setCounts(results);
      setReviewCount(revCount ?? 0);
    } catch (err) {
      console.error('Error loading overview counts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecentActivity() {
    try {
      const { data: entries, error } = await supabase
        .from('cms_audit_log' as 'events')
        .select('id, action, actor_id, source_table, source_id, timestamp')
        .order('timestamp', { ascending: false })
        .limit(5);

      if (error || !entries) {
        setRecentActivity([]);
        return;
      }

      // Collect unique actor IDs
      const actorIds = [
        ...new Set(
          (entries as unknown as AuditEntry[])
            .map((e) => e.actor_id)
            .filter(Boolean) as string[]
        ),
      ];

      // Batch-fetch actor emails
      let actorMap: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, email')
          .in('user_id', actorIds);

        if (profiles) {
          actorMap = Object.fromEntries(
            (profiles as { user_id: string; email: string }[]).map((p) => [p.user_id, p.email]),
          );
        }
      }

      setRecentActivity(
        (entries as unknown as AuditEntry[]).map((e) => ({
          ...e,
          actorEmail: e.actor_id ? actorMap[e.actor_id] : undefined,
        })),
      );
    } catch (err) {
      // Silently fail — recent activity is non-critical
      console.error('Error loading recent activity:', err);
      setRecentActivity([]);
    }
  }

  if (loading) {
    return <OverviewSkeleton />;
  }

  const totalContent = counts.reduce((sum, c) => sum + c.count, 0);
  const maxCount = Math.max(...counts.map((c) => c.count), 1);

  const statValues = [
    totalContent.toLocaleString(),
    reviewCount.toString(),
    counts.length.toString(),
  ];

  return (
    <Box>
      {/* ── Header with greeting ────────────────────────────────── */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          {firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Overview of all content across the platform
        </Typography>
      </Box>

      {/* ── Summary stat cards ──────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {STAT_CARDS.map((card, i) => {
          const StatIcon = card.icon;
          const isQueue = card.key === 'queue';

          return (
            <Grid key={card.key} size={{ xs: 6, sm: 3 }}>
              <Paper
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  borderLeft: `3px solid ${card.color}`,
                  background: (theme) =>
                    `linear-gradient(135deg, ${alpha(card.color, 0.04)} 0%, ${theme.palette.background.paper} 100%)`,
                  cursor: isQueue ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  '&:hover': isQueue
                    ? {
                        transform: 'translateY(-2px)',
                        boxShadow: (_theme) => `0 4px 12px ${alpha(card.color, 0.15)}`,
                      }
                    : {},
                }}
                onClick={isQueue ? () => onNavigate('review') : undefined}
              >
                {isQueue ? (
                  /* Review queue special card */
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: alpha(card.color, 0.12),
                        }}
                      >
                        <ClipboardCheck size={18} style={{ color: card.color }} />
                      </Box>
                      {reviewCount > 0 ? (
                        <Chip
                          label="Action Needed"
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            bgcolor: alpha('#f59e0b', 0.12),
                            color: '#d97706',
                          }}
                        />
                      ) : (
                        <Chip
                          label="All Clear"
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            bgcolor: alpha('#10b981', 0.12),
                            color: '#059669',
                          }}
                        />
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      Review Queue
                    </Typography>
                  </>
                ) : (
                  /* Normal stat card */
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: alpha(card.color, 0.12),
                        }}
                      >
                        <StatIcon size={18} style={{ color: card.color }} />
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 500, color: 'text.secondary', letterSpacing: '0.02em' }}
                      >
                        {card.label}
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
                      {statValues[i]}
                    </Typography>
                  </>
                )}
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* ── Content type cards ──────────────────────────────────── */}
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
        Content Types
      </Typography>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {counts.map((ct) => {
          const Icon = ct.icon;
          const barWidth = Math.max((ct.count / maxCount) * 100, 2);

          return (
            <Grid key={ct.id} size={{ xs: 6, sm: 4, md: 3 }}>
              <Paper
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  borderRadius: 2,
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: (_theme) => `0 4px 16px ${alpha(ct.color, 0.18)}`,
                  },
                }}
                onClick={() =>
                  ct.id === 'cms_pages'
                    ? onNavigate('pages')
                    : onNavigate('content', ct.id)
                }
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: alpha(ct.color, 0.12),
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={14} style={{ color: ct.color }} />
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ct.label}
                  </Typography>
                </Box>

                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
                  {ct.count.toLocaleString()}
                </Typography>

                {/* Visual weight bar */}
                <Box
                  sx={{
                    width: '100%',
                    height: 4,
                    borderRadius: 2,
                    bgcolor: alpha(ct.color, 0.1),
                  }}
                >
                  <Box
                    sx={{
                      width: `${barWidth}%`,
                      height: '100%',
                      borderRadius: 2,
                      bgcolor: ct.color,
                      transition: 'width 0.6s ease',
                    }}
                  />
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* ── Recent Activity ─────────────────────────────────────── */}
      {recentActivity.length > 0 && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Recent Activity
            </Typography>
            <Button
              size="small"
              endIcon={<ArrowRight size={14} />}
              onClick={() => onNavigate('audit')}
              sx={{ textTransform: 'none', fontSize: '0.8rem' }}
            >
              View all
            </Button>
          </Box>
          <Paper sx={{ borderRadius: 2, overflow: 'hidden', mb: 3 }}>
            {recentActivity.map((entry, idx) => {
              const actionColor = getActionColor(entry.action);
              const isLast = idx === recentActivity.length - 1;

              return (
                <Box
                  key={entry.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    px: 2.5,
                    py: 1.5,
                    borderBottom: isLast ? 'none' : '1px solid',
                    borderColor: 'divider',
                    transition: 'background 0.15s',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {/* Timeline dot */}
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: actionColor,
                      flexShrink: 0,
                    }}
                  />

                  {/* Details */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                      {formatAction(entry.action)}
                      {entry.source_table && (
                        <Typography
                          component="span"
                          variant="body2"
                          sx={{ color: 'text.secondary', fontWeight: 400 }}
                        >
                          {' '}on {entry.source_table.replace(/_/g, ' ')}
                        </Typography>
                      )}
                    </Typography>
                    {entry.actorEmail && (
                      <Typography variant="caption" color="text.secondary">
                        {entry.actorEmail}
                      </Typography>
                    )}
                  </Box>

                  {/* Timestamp */}
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {relativeTime(entry.timestamp)}
                  </Typography>
                </Box>
              );
            })}
          </Paper>
        </>
      )}

      {/* ── Quick Actions ───────────────────────────────────────── */}
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
        Quick Actions
      </Typography>

      <Grid container spacing={1.5}>
        {/* Create actions */}
        <Grid size={12}>
          <Typography
            variant="overline"
            sx={{ fontSize: '0.65rem', color: 'text.secondary', letterSpacing: '0.08em' }}
          >
            Create
          </Typography>
        </Grid>
        {[
          { label: 'New Page', icon: FileText, color: '#64748b', onClick: () => onEdit('cms_pages', null) },
          { label: 'New Venue', icon: MapPin, color: 'hsl(var(--brand))', onClick: () => onEdit('venues', null) },
          { label: 'New Event', icon: Calendar, color: '#ec4899', onClick: () => onEdit('events', null) },
          { label: 'New Article', icon: Newspaper, color: '#3b82f6', onClick: () => onEdit('news_articles', null) },
        ].map((action) => {
          return (
            <Grid key={action.label} size={{ xs: 6, sm: 3 }}>
              <Paper
                onClick={action.onClick}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: alpha(action.color, 0.06),
                    transform: 'translateY(-1px)',
                    boxShadow: (_theme) => `0 2px 8px ${alpha(action.color, 0.12)}`,
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha(action.color, 0.1),
                  }}
                >
                  <Plus size={14} style={{ color: action.color }} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {action.label}
                </Typography>
              </Paper>
            </Grid>
          );
        })}

        {/* Navigate actions */}
        <Grid size={12} sx={{ mt: 1 }}>
          <Typography
            variant="overline"
            sx={{ fontSize: '0.65rem', color: 'text.secondary', letterSpacing: '0.08em' }}
          >
            Navigate
          </Typography>
        </Grid>
        {[
          { label: 'Media Library', icon: Image, color: '#14b8a6', onClick: () => onNavigate('media') },
          { label: 'Review Queue', icon: ClipboardCheck, color: '#f59e0b', onClick: () => onNavigate('review') },
          { label: 'Audit Log', icon: History, color: '#6366f1', onClick: () => onNavigate('audit') },
          { label: 'All Content', icon: BarChart3, color: '#6b7280', onClick: () => onNavigate('content') },
        ].map((action) => {
          const ActionIcon = action.icon;
          return (
            <Grid key={action.label} size={{ xs: 6, sm: 3 }}>
              <Paper
                onClick={action.onClick}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    bgcolor: alpha(action.color, 0.06),
                    transform: 'translateY(-1px)',
                    boxShadow: (_theme) => `0 2px 8px ${alpha(action.color, 0.12)}`,
                  },
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha(action.color, 0.1),
                  }}
                >
                  <ActionIcon size={16} style={{ color: action.color }} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {action.label}
                </Typography>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
