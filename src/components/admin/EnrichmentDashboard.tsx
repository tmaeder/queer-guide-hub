import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { alpha } from '@mui/material/styles';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Clock,
  Sparkles,
  Building,
  Calendar,
  Users,
  Newspaper,
  GitMerge,
  BarChart3,
  Inbox,
  Check,
  X,
} from 'lucide-react';
import {
  useEnrichmentDashboard,
  useEnrichmentFailures,
  useRetryEnrichment,
  useResolveReviewItem,
  type EnrichmentDashboardData,
  type ReviewQueueItem,
  type QualityDistribution,
} from '@/hooks/useEnrichmentDashboard';
import { brandColors } from '@/theme/muiTheme';

// ── Helper ──────────────────────────────────────────────────────────────

const ENTITY_META: Record<string, { label: string; icon: typeof Building; color: string }> = {
  venues: { label: 'Venues', icon: Building, color: brandColors.main },
  events: { label: 'Events', icon: Calendar, color: '#ec4899' },
  personalities: { label: 'Personalities', icon: Users, color: '#f59e0b' },
  news_articles: { label: 'News', icon: Newspaper, color: '#3b82f6' },
};

const STEP_LABELS: Record<string, string> = {
  geo_link: 'Geo Link',
  embedding: 'Embedding',
  ensure_links: 'Links',
  dedupe_check: 'Dedupe',
  quality_score: 'Quality Score',
};

const REVIEW_TYPE_META: Record<string, { label: string; color: string; icon: typeof GitMerge }> = {
  duplicate: { label: 'Duplicate', color: '#f59e0b', icon: GitMerge },
  low_quality: { label: 'Low Quality', color: '#ef4444', icon: AlertCircle },
  anomaly: { label: 'Anomaly', color: brandColors.main, icon: AlertTriangle },
  stale: { label: 'Stale', color: '#6b7280', icon: Clock },
  broken_source: { label: 'Broken Source', color: '#ea580c', icon: XCircle },
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Pipeline Health Card ────────────────────────────────────────────────

function PipelineHealthCard({ data }: { data: EnrichmentDashboardData }) {
  const { health } = data;
  const { last24h } = health;
  const successRate = last24h.total > 0 ? Math.round((last24h.done / last24h.total) * 100) : 100;
  const statusColor = successRate >= 95 ? '#10b981' : successRate >= 80 ? '#f59e0b' : '#ef4444';

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: 1.5, display: 'flex',
            alignItems: 'center', justifyContent: 'center', bgcolor: alpha('#10b981', 0.1),
          }}
        >
          <Activity size={15} style={{ color: '#10b981' }} />
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Pipeline Health (24h)
        </Typography>
        {health.queueDepth > 0 && (
          <Chip
            label={`${health.queueDepth} queued`}
            size="small"
            sx={{ ml: 'auto', height: 20, fontSize: '0.7rem', fontWeight: 600, bgcolor: alpha('#3b82f6', 0.12), color: '#3b82f6' }}
          />
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 2 }}>
        <MetricBox label="Total" value={last24h.total.toLocaleString()} color="#3b82f6" />
        <MetricBox label="Done" value={last24h.done.toLocaleString()} color="#10b981" />
        <MetricBox label="Failed" value={last24h.failed.toLocaleString()} color={last24h.failed > 0 ? '#ef4444' : '#10b981'} />
        <MetricBox label="Success Rate" value={`${successRate}%`} color={statusColor} />
      </Box>

      {Object.keys(health.avgDurationMs).length > 0 && (
        <>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, display: 'block' }}>
            Avg Duration by Step
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {Object.entries(health.avgDurationMs).map(([step, ms]) => (
              <Chip
                key={step}
                label={`${STEP_LABELS[step] ?? step}: ${formatMs(ms)}`}
                size="small"
                variant="outlined"
                sx={{
                  height: 22, fontSize: '0.7rem',
                  borderColor: health.failuresByStep[step] ? alpha('#ef4444', 0.4) : 'divider',
                  color: health.failuresByStep[step] ? '#ef4444' : 'text.secondary',
                }}
              />
            ))}
          </Box>
        </>
      )}

      {Object.keys(health.failuresByStep).length > 0 && (
        <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {Object.entries(health.failuresByStep).map(([step, count]) => (
            <Chip
              key={step}
              icon={<AlertCircle size={12} />}
              label={`${STEP_LABELS[step] ?? step}: ${count} failures`}
              size="small"
              sx={{ height: 22, fontSize: '0.7rem', bgcolor: alpha('#ef4444', 0.08), color: '#ef4444' }}
            />
          ))}
        </Box>
      )}
    </Paper>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: alpha(color, 0.06), textAlign: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 700, color }}>
        {value}
      </Typography>
    </Box>
  );
}

// ── Quality Distribution Card ───────────────────────────────────────────

function QualityDistributionCard({ quality }: { quality: QualityDistribution[] }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: 1.5, display: 'flex',
            alignItems: 'center', justifyContent: 'center', bgcolor: alpha('#3b82f6', 0.1),
          }}
        >
          <BarChart3 size={15} style={{ color: '#3b82f6' }} />
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Quality Scores
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {quality.map((q) => {
          const meta = ENTITY_META[q.entityType];
          if (!meta) return null;
          const Icon = meta.icon;
          const excellentPct = q.total > 0 ? (q.excellent / q.total) * 100 : 0;
          const goodPct = q.total > 0 ? (q.good / q.total) * 100 : 0;
          const attentionPct = q.total > 0 ? (q.needsAttention / q.total) * 100 : 0;

          return (
            <Box key={q.entityType}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Icon size={14} style={{ color: meta.color }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {meta.label}
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  avg {q.avgScore}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', bgcolor: alpha('#64748b', 0.1) }}>
                {excellentPct > 0 && (
                  <Tooltip title={`Excellent (>=80): ${q.excellent}`}>
                    <Box sx={{ width: `${excellentPct}%`, bgcolor: '#10b981' }} />
                  </Tooltip>
                )}
                {goodPct > 0 && (
                  <Tooltip title={`Good (40-79): ${q.good}`}>
                    <Box sx={{ width: `${goodPct}%`, bgcolor: '#f59e0b' }} />
                  </Tooltip>
                )}
                {attentionPct > 0 && (
                  <Tooltip title={`Needs Attention (<40): ${q.needsAttention}`}>
                    <Box sx={{ width: `${attentionPct}%`, bgcolor: '#ef4444' }} />
                  </Tooltip>
                )}
              </Box>

              <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 500 }}>
                  {q.excellent.toLocaleString()} excellent
                </Typography>
                <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 500 }}>
                  {q.good.toLocaleString()} good
                </Typography>
                {q.needsAttention > 0 && (
                  <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 500 }}>
                    {q.needsAttention.toLocaleString()} attention
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} />
          <Typography variant="caption" color="text.secondary">Excellent (80+)</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f59e0b' }} />
          <Typography variant="caption" color="text.secondary">Good (40-79)</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444' }} />
          <Typography variant="caption" color="text.secondary">Needs Attention (&lt;40)</Typography>
        </Box>
      </Box>
    </Paper>
  );
}

// ── Needs Attention Summary ─────────────────────────────────────────────

function NeedsAttentionCard({ data }: { data: EnrichmentDashboardData }) {
  const { needsAttention } = data;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: 1.5, display: 'flex',
            alignItems: 'center', justifyContent: 'center', bgcolor: alpha('#ef4444', 0.1),
          }}
        >
          <AlertTriangle size={15} style={{ color: '#ef4444' }} />
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Needs Attention
        </Typography>
        {needsAttention.total > 0 && (
          <Chip
            label={needsAttention.total}
            size="small"
            sx={{ ml: 'auto', height: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: alpha('#ef4444', 0.12), color: '#ef4444' }}
          />
        )}
      </Box>

      {needsAttention.total === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, borderRadius: 1.5, bgcolor: alpha('#10b981', 0.06) }}>
          <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 500 }}>
            All content is above quality threshold
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
          {(['venues', 'events', 'personalities', 'news_articles'] as const).map((type) => {
            const meta = ENTITY_META[type];
            const count = needsAttention[type];
            const Icon = meta.icon;
            return (
              <Box
                key={type}
                sx={{
                  p: 1.5, borderRadius: 1.5, textAlign: 'center',
                  bgcolor: count > 0 ? alpha('#ef4444', 0.06) : alpha('#10b981', 0.04),
                }}
              >
                <Icon size={16} style={{ color: count > 0 ? '#ef4444' : meta.color, marginBottom: 4 }} />
                <Typography variant="body1" sx={{ fontWeight: 700, color: count > 0 ? '#ef4444' : '#10b981' }}>
                  {count}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                  {meta.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}

// ── Review Queue Card ───────────────────────────────────────────────────

function ReviewQueueCard({ items }: { items: ReviewQueueItem[] }) {
  const resolve = useResolveReviewItem();
  const [confirmItem, setConfirmItem] = useState<{ item: ReviewQueueItem; action: 'resolved' | 'dismissed' } | null>(null);

  const handleResolve = () => {
    if (!confirmItem) return;
    resolve.mutate(
      { id: confirmItem.item.id, resolution: confirmItem.action },
      { onSettled: () => setConfirmItem(null) },
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: 1.5, display: 'flex',
            alignItems: 'center', justifyContent: 'center', bgcolor: alpha('#f59e0b', 0.1),
          }}
        >
          <Inbox size={15} style={{ color: '#f59e0b' }} />
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Review Queue
        </Typography>
        <Chip
          label={`${items.length} pending`}
          size="small"
          sx={{
            ml: 'auto', height: 20, fontSize: '0.7rem', fontWeight: 600,
            bgcolor: items.length > 0 ? alpha('#f59e0b', 0.12) : alpha('#10b981', 0.12),
            color: items.length > 0 ? '#f59e0b' : '#10b981',
          }}
        />
      </Box>

      {items.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, borderRadius: 1.5, bgcolor: alpha('#10b981', 0.06) }}>
          <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 500 }}>
            No items pending review
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 400, overflow: 'auto' }}>
          {items.map((item) => {
            const typeMeta = REVIEW_TYPE_META[item.review_type] ?? REVIEW_TYPE_META.anomaly;
            const entityMeta = ENTITY_META[item.entity_type];
            const TypeIcon = typeMeta.icon;
            const details = item.details as Record<string, any>;

            return (
              <Box
                key={item.id}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  px: 1.5, py: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
                  <TypeIcon size={14} style={{ color: typeMeta.color, flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Chip
                        label={typeMeta.label}
                        size="small"
                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, bgcolor: alpha(typeMeta.color, 0.1), color: typeMeta.color }}
                      />
                      <Chip
                        label={entityMeta?.label ?? item.entity_type}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.6rem' }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }} noWrap>
                      {details.candidate_name
                        ? `Similar to: ${details.candidate_name} (${Math.round((details.similarity_score ?? 0) * 100)}%)`
                        : details.reason ?? item.entity_id.slice(0, 8)}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  <Tooltip title="Resolve">
                    <IconButton
                      size="small"
                      onClick={() => setConfirmItem({ item, action: 'resolved' })}
                      sx={{ color: '#10b981' }}
                    >
                      <Check size={14} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Dismiss">
                    <IconButton
                      size="small"
                      onClick={() => setConfirmItem({ item, action: 'dismissed' })}
                      sx={{ color: '#6b7280' }}
                    >
                      <X size={14} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <Dialog open={!!confirmItem} onClose={() => setConfirmItem(null)} maxWidth="xs" fullWidth>
        {confirmItem && (
          <>
            <DialogTitle sx={{ fontWeight: 700 }}>
              {confirmItem.action === 'resolved' ? 'Resolve' : 'Dismiss'} Review Item?
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                {confirmItem.action === 'resolved'
                  ? 'This marks the item as reviewed and resolved.'
                  : 'This dismisses the item without action.'}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmItem(null)} sx={{ textTransform: 'none' }}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleResolve}
                disabled={resolve.isPending}
                color={confirmItem.action === 'resolved' ? 'success' : 'inherit'}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                {confirmItem.action === 'resolved' ? 'Resolve' : 'Dismiss'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Paper>
  );
}

// ── Failed Enrichments Card ─────────────────────────────────────────────

function FailedEnrichmentsCard() {
  const { data: failures, isLoading } = useEnrichmentFailures();
  const retry = useRetryEnrichment();

  if (isLoading) {
    return <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2 }} />;
  }

  const items = failures ?? [];

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: 1.5, display: 'flex',
            alignItems: 'center', justifyContent: 'center', bgcolor: alpha('#ef4444', 0.1),
          }}
        >
          <XCircle size={15} style={{ color: '#ef4444' }} />
        </Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Failed Enrichments (7d)
        </Typography>
        <Chip
          label={items.length}
          size="small"
          sx={{
            ml: 'auto', height: 20, fontSize: '0.7rem', fontWeight: 600,
            bgcolor: items.length > 0 ? alpha('#ef4444', 0.12) : alpha('#10b981', 0.12),
            color: items.length > 0 ? '#ef4444' : '#10b981',
          }}
        />
      </Box>

      {items.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, borderRadius: 1.5, bgcolor: alpha('#10b981', 0.06) }}>
          <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 500 }}>
            No failed enrichments
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 300, overflow: 'auto' }}>
          {items.map((item) => {
            const entityMeta = ENTITY_META[item.entity_type];
            const EntityIcon = entityMeta?.icon ?? Building;
            return (
              <Box
                key={`${item.entity_type}-${item.entity_id}`}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  px: 1.5, py: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
                  <EntityIcon size={14} style={{ color: entityMeta?.color ?? '#6b7280', flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Chip
                        label={entityMeta?.label ?? item.entity_type}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.6rem' }}
                      />
                      {item.failed_steps?.map((step) => (
                        <Chip
                          key={step}
                          label={STEP_LABELS[step] ?? step}
                          size="small"
                          sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, bgcolor: alpha('#ef4444', 0.1), color: '#ef4444' }}
                        />
                      ))}
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }} noWrap>
                      {item.entity_id.slice(0, 8)}... | score: {item.quality_score ?? 'n/a'}
                    </Typography>
                  </Box>
                </Box>

                <Tooltip title="Retry failed steps">
                  <IconButton
                    size="small"
                    onClick={() => retry.mutate({ entityType: item.entity_type, entityId: item.entity_id })}
                    disabled={retry.isPending}
                    sx={{ color: '#3b82f6' }}
                  >
                    <RefreshCw size={14} />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          })}
        </Box>
      )}

      {items.length > 5 && (
        <Button
          size="small"
          onClick={() => items.forEach((item) => retry.mutate({ entityType: item.entity_type, entityId: item.entity_id }))}
          disabled={retry.isPending}
          startIcon={<RefreshCw size={14} />}
          sx={{ mt: 1.5, textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
        >
          Retry All ({items.length})
        </Button>
      )}
    </Paper>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={200} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    </Box>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export function EnrichmentDashboard() {
  const { data, isLoading, refetch } = useEnrichmentDashboard();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Sparkles size={24} style={{ color: '#0891b2' }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Enrichment Pipeline
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => refetch()}>
            <RefreshCw size={16} />
          </IconButton>
        </Tooltip>
      </Box>

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2 }}>
            <PipelineHealthCard data={data} />
            <NeedsAttentionCard data={data} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <QualityDistributionCard quality={data.quality} />
            <ReviewQueueCard items={data.reviewQueue} />
          </Box>

          <FailedEnrichmentsCard />
        </Box>
      )}
    </Box>
  );
}
