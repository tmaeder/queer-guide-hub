/**
 * News Quality Review Tab — surfaces news_articles flagged by the
 * pipeline-quality-enhance stage (quality_status = 'review' or 'rejected').
 *
 * Shows the AI's structured QualityDecision plus side-by-side before/after,
 * with admin actions: approve & publish, send to drafts, mark irrelevant,
 * revert to original (from news_articles_originals).
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { CheckCircle2, AlertTriangle, RotateCcw, EyeOff } from 'lucide-react';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';

// New news_articles columns + the news_articles_originals table aren't in the
// generated Database types yet. Route writes/reads through a permissive client
// until types regenerate. Reads are still narrowed via the ArticleRow cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = untypedSupabase as any;

type Sentiment = 'positive' | 'neutral' | 'negative' | 'mixed';

interface QualityDecision {
  isRelevant: boolean;
  relevanceScore: number;
  qualityScoreBefore: number;
  qualityScoreAfter: number;
  shouldPublish: boolean;
  needsManualReview: boolean;
  title: string;
  excerpt: string;
  cleanedBody: string;
  sentiment: Sentiment;
  tags: string[];
  warnings: string[];
  removedArtifacts: string[];
  confidence: number;
  isSatire?: boolean;
  isAdvertorial?: boolean;
}

interface ArticleRow {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  url: string | null;
  quality_status: string | null;
  quality_score: number | null;
  relevance_score: number | null;
  sentiment: Sentiment | null;
  quality_decision: QualityDecision | null;
  auto_publish_blocked_reasons: string[] | null;
  last_quality_run_at: string | null;
}

const STATUSES = ['review', 'rejected'] as const;

function HealthStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Typography>
    </Box>
  );
}

function ScoreChip({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  const color = v >= 0.75 ? 'success' : v >= 0.5 ? 'warning' : 'default';
  return (
    <Chip
      size="small"
      label={`${label} ${(v * 100).toFixed(0)}%`}
      color={color as 'success' | 'warning' | 'default'}
      variant="outlined"
    />
  );
}

export default function NewsQualityReviewTab() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ArticleRow | null>(null);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['news-quality-review'],
    queryFn: async () => {
      const { data, error: e } = await sb.from('news_articles')
        .select(
          'id,title,content,image_url,url,quality_status,quality_score,relevance_score,sentiment,quality_decision,auto_publish_blocked_reasons,last_quality_run_at'
        )
        .in('quality_status', STATUSES as unknown as string[])
        .order('last_quality_run_at', { ascending: false, nullsFirst: false })
        .limit(100);
      if (e) throw e;
      return (data ?? []) as unknown as ArticleRow[];
    },
  });

  const approve = useMutation({
    mutationFn: async (row: ArticleRow) => {
      const d = row.quality_decision;
      const { error: e } = await sb.from('news_articles')
        .update({
          title: d?.title || row.title,
          content: d?.cleanedBody || row.content,
          quality_status: 'passed',
          auto_publish_blocked_reasons: [],
        })
        .eq('id', row.id);
      if (e) throw e;
    },
    onSuccess: () => {
      toast.success('Article approved & published');
      qc.invalidateQueries({ queryKey: ['news-quality-review'] });
      setSelected(null);
    },
    onError: (e: Error) => toast.error(`Approve failed: ${e.message}`),
  });

  const markIrrelevant = useMutation({
    mutationFn: async (row: ArticleRow) => {
      const { error: e } = await sb.from('news_articles')
        .update({ quality_status: 'rejected' })
        .eq('id', row.id);
      if (e) throw e;
    },
    onSuccess: () => {
      toast.success('Marked as irrelevant');
      qc.invalidateQueries({ queryKey: ['news-quality-review'] });
      setSelected(null);
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const revert = useMutation({
    mutationFn: async (row: ArticleRow) => {
      const { data: orig, error: e } = await sb.from('news_articles_originals')
        .select('original_title, original_content, original_image_url')
        .eq('article_id', row.id)
        .maybeSingle();
      if (e) throw e;
      if (!orig) throw new Error('No original snapshot — nothing to revert');
      const { error: u } = await sb.from('news_articles')
        .update({
          title: orig.original_title,
          content: orig.original_content,
          image_url: orig.original_image_url,
          quality_status: 'pending',
        })
        .eq('id', row.id);
      if (u) throw u;
    },
    onSuccess: () => {
      toast.success('Reverted to original');
      qc.invalidateQueries({ queryKey: ['news-quality-review'] });
      setSelected(null);
    },
    onError: (e: Error) => toast.error(`Revert failed: ${e.message}`),
  });

  const counts = useMemo(() => {
    const out = { review: 0, rejected: 0 };
    for (const r of rows ?? []) {
      if (r.quality_status === 'review') out.review++;
      else if (r.quality_status === 'rejected') out.rejected++;
    }
    return out;
  }, [rows]);

  const { data: health } = useQuery({
    queryKey: ['news-quality-health'],
    queryFn: async () => {
      const { data, error: e } = await sb.from('news_quality_health').select('*').single();
      if (e) throw e;
      return data as {
        passed: number; review: number; rejected: number; pending: number;
        legacy_unprocessed: number; total: number;
        avg_relevance: number | null; avg_quality_after: number | null;
        avg_quality_delta: number | null; last_run_at: string | null;
      };
    },
    refetchInterval: 60_000,
  });

  const { data: settings } = useQuery({
    queryKey: ['news-quality-settings'],
    queryFn: async () => {
      const { data, error: e } = await sb.from('news_quality_settings').select('*').eq('id', 1).maybeSingle();
      if (e) throw e;
      return data as { enabled: boolean; auto_publish_enabled: boolean; image_replacement_enabled: boolean } | null;
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error: e } = await sb.from('news_quality_settings')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (e) throw e;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['news-quality-settings'] });
      toast.success('Setting updated');
    },
    onError: (e: Error) => toast.error(`Toggle failed: ${e.message}`),
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }

  return (
    <Box>
      {settings && (
        <Box sx={{ mb: 3, p: 2, border: '1px solid', borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Pipeline status:
            </Typography>
            <Chip
              size="small"
              label={settings.enabled ? 'Enabled' : 'Disabled'}
              color={settings.enabled ? 'success' : 'default'}
            />
            <Button
              size="small"
              variant={settings.enabled ? 'outlined' : 'contained'}
              color={settings.enabled ? 'error' : 'success'}
              onClick={() => toggleEnabled.mutate(!settings.enabled)}
              disabled={toggleEnabled.isPending}
            >
              {settings.enabled ? 'Disable' : 'Enable'}
            </Button>
          </Stack>
        </Box>
      )}

      {health && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(6,1fr)' },
            gap: 2,
            mb: 3,
          }}
        >
          <HealthStat label="Passed" value={health.passed} color="#22c55e" />
          <HealthStat label="Review" value={health.review} color="#f59e0b" />
          <HealthStat label="Rejected" value={health.rejected} color="#ef4444" />
          <HealthStat label="Legacy" value={health.legacy_unprocessed} color="#6b7280" />
          <HealthStat
            label="Avg relevance"
            value={health.avg_relevance != null ? `${(health.avg_relevance * 100).toFixed(0)}%` : '—'}
            color="#3b82f6"
          />
          <HealthStat
            label="Avg quality"
            value={health.avg_quality_after != null ? `${(health.avg_quality_after * 100).toFixed(0)}%` : '—'}
            color="#3b82f6"
          />
        </Box>
      )}

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Chip label={`Review: ${counts.review}`} color="warning" variant="outlined" />
        <Chip label={`Rejected: ${counts.rejected}`} color="error" variant="outlined" />
      </Stack>

      {(!rows || rows.length === 0) && (
        <Alert severity="info">No articles awaiting quality review.</Alert>
      )}

      <Stack spacing={2}>
        {rows?.map((r) => (
          <Box
            key={r.id}
            sx={{
              p: 2,
              border: '1px solid',
              borderColor: 'divider',
              cursor: 'pointer',
              '&:hover': { backgroundColor: 'action.hover' },
            }}
            onClick={() => setSelected(r)}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {r.quality_decision?.title || r.title}
                </Typography>
                {r.quality_decision?.excerpt && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {r.quality_decision.excerpt}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                  <ScoreChip label="Relevance" value={r.relevance_score} />
                  <ScoreChip label="Quality" value={r.quality_score} />
                  {r.sentiment && <Chip size="small" label={r.sentiment} variant="outlined" />}
                  {r.quality_decision?.isSatire && (
                    <Chip size="small" label="satire" color="warning" />
                  )}
                  {(r.auto_publish_blocked_reasons ?? []).map((reason) => (
                    <Chip key={reason} size="small" label={reason} variant="outlined" />
                  ))}
                </Stack>
              </Box>
              <Chip
                size="small"
                label={r.quality_status ?? 'pending'}
                color={r.quality_status === 'review' ? 'warning' : 'error'}
              />
            </Stack>
          </Box>
        ))}
      </Stack>

      <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="lg">
        {selected && (
          <>
            <DialogTitle>{selected.quality_decision?.title || selected.title}</DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <ScoreChip label="Relevance" value={selected.relevance_score} />
                  <ScoreChip label="Quality (after)" value={selected.quality_score} />
                  <ScoreChip
                    label="Quality (before)"
                    value={selected.quality_decision?.qualityScoreBefore ?? null}
                  />
                  <ScoreChip
                    label="Confidence"
                    value={selected.quality_decision?.confidence ?? null}
                  />
                </Stack>

                {selected.quality_decision?.warnings.length ? (
                  <Alert severity="warning" icon={<AlertTriangle size={16} />}>
                    {selected.quality_decision.warnings.join(' • ')}
                  </Alert>
                ) : null}

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Original
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                      {selected.title}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {selected.content?.slice(0, 4000)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Cleaned
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                      {selected.quality_decision?.title}
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {selected.quality_decision?.cleanedBody.slice(0, 4000)}
                    </Typography>
                  </Box>
                </Box>

                {selected.quality_decision?.removedArtifacts.length ? (
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Removed artefacts
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {selected.quality_decision.removedArtifacts.map((a) => (
                        <Chip key={a} size="small" label={a} variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                ) : null}

                {selected.quality_decision?.tags.length ? (
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Suggested tags
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {selected.quality_decision.tags.map((t) => (
                        <Chip key={t} size="small" label={t} />
                      ))}
                    </Stack>
                  </Box>
                ) : null}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
              <Button
                color="inherit"
                startIcon={<RotateCcw size={16} />}
                onClick={() => revert.mutate(selected)}
                disabled={revert.isPending}
              >
                Revert to original
              </Button>
              <Stack direction="row" spacing={1}>
                <Button
                  color="error"
                  startIcon={<EyeOff size={16} />}
                  onClick={() => markIrrelevant.mutate(selected)}
                  disabled={markIrrelevant.isPending}
                >
                  Mark irrelevant
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<CheckCircle2 size={16} />}
                  onClick={() => approve.mutate(selected)}
                  disabled={approve.isPending}
                >
                  Approve & publish
                </Button>
              </Stack>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
