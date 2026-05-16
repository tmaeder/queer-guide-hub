/**
 * News Quality Review Tab — surfaces news_articles flagged by the
 * pipeline-quality-enhance stage (quality_status = 'review' or 'rejected').
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { CheckCircle2, AlertTriangle, RotateCcw, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';
import { diffWords, diffChangeRatio } from '@/lib/text-diff';

const sb = untypedSupabase;

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

const fmtPct = (v: number) => `${(v > 1 ? v : v * 100).toFixed(0)}%`;

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
    <div className="border p-3">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <div className="text-2xl font-bold" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function InlineDiff({ before, after }: { before: string; after: string }) {
  const segs = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {segs.map((s, i) => {
        if (s.kind === 'eq') return <span key={i}>{s.text}</span>;
        if (s.kind === 'add') {
          return (
            <span
              key={i}
              style={{
                backgroundColor: 'rgba(34,197,94,0.18)',
                color: 'rgb(21,128,61)',
                padding: '0 2px',
              }}
            >
              {s.text}
            </span>
          );
        }
        return (
          <span
            key={i}
            style={{
              backgroundColor: 'rgba(239,68,68,0.18)',
              color: 'rgb(153,27,27)',
              textDecoration: 'line-through',
              padding: '0 2px',
            }}
          >
            {s.text}
          </span>
        );
      })}
    </div>
  );
}

function ScoreChip({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  const tone =
    v >= 0.75
      ? 'border-emerald-500 text-emerald-600'
      : v >= 0.5
        ? 'border-amber-500 text-amber-600'
        : 'border-muted text-muted-foreground';
  return (
    <Badge variant="outline" className={cn('font-normal', tone)}>
      {label} {(v * 100).toFixed(0)}%
    </Badge>
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

  const { data: sourceHealth } = useQuery({
    queryKey: ['news-quality-source-health'],
    queryFn: async () => {
      const { data, error: e } = await sb
        .from('news_quality_source_health')
        .select('source_id, source_name, total, passed, review, rejected, reject_rate, avg_quality')
        .gte('total', 5)
        .order('reject_rate', { ascending: false, nullsFirst: false })
        .limit(8);
      if (e) throw e;
      return (data ?? []) as Array<{
        source_id: string; source_name: string; total: number;
        passed: number; review: number; rejected: number;
        reject_rate: number | null; avg_quality: number | null;
      }>;
    },
    refetchInterval: 120_000,
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
      <div className="p-8 text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div>
      {settings && (
        <div className="mb-6 border p-4">
          <div className="flex items-center gap-4">
            <h4 className="text-sm font-semibold">Pipeline status:</h4>
            <Badge variant={settings.enabled ? 'default' : 'secondary'}>
              {settings.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <Button
              size="sm"
              variant={settings.enabled ? 'outline' : 'default'}
              onClick={() => toggleEnabled.mutate(!settings.enabled)}
              disabled={toggleEnabled.isPending}
            >
              {settings.enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </div>
      )}

      {health && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
          <HealthStat label="Passed" value={health.passed} color="#22c55e" />
          <HealthStat label="Review" value={health.review} color="#f59e0b" />
          <HealthStat label="Rejected" value={health.rejected} color="#ef4444" />
          <HealthStat label="Legacy" value={health.legacy_unprocessed} color="#6b7280" />
          <HealthStat
            label="Avg relevance"
            value={health.avg_relevance != null ? fmtPct(health.avg_relevance) : '—'}
            color="#3b82f6"
          />
          <HealthStat
            label="Avg quality"
            value={health.avg_quality_after != null ? fmtPct(health.avg_quality_after) : '—'}
            color="#3b82f6"
          />
        </div>
      )}

      {sourceHealth && sourceHealth.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
            Sources by reject rate
          </p>
          <div className="grid grid-cols-1 gap-2">
            {sourceHealth.map((s) => {
              const pct = s.reject_rate != null ? Math.round(s.reject_rate * 100) : 0;
              const tone =
                pct > 50
                  ? 'border-red-500 text-red-600'
                  : pct > 25
                    ? 'border-amber-500 text-amber-600'
                    : '';
              return (
                <div
                  key={s.source_id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border p-2"
                >
                  <p className="text-sm font-semibold">{s.source_name}</p>
                  <span className="text-xs text-muted-foreground">
                    {s.passed} passed · {s.review} review · {s.rejected} rejected ({s.total})
                  </span>
                  <Badge variant="outline" className={cn('font-normal', tone)}>
                    {pct}% reject
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant="outline" className="border-amber-500 text-amber-600">
          Review: {counts.review}
        </Badge>
        <Badge variant="outline" className="border-red-500 text-red-600">
          Rejected: {counts.rejected}
        </Badge>
      </div>

      {(!rows || rows.length === 0) && (
        <Alert>
          <AlertDescription>No articles awaiting quality review.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        {rows?.map((r) => (
          <div
            key={r.id}
            className="cursor-pointer border p-4 hover:bg-accent"
            onClick={() => setSelected(r)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelected(r);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">
                  {r.quality_decision?.title || r.title}
                </p>
                {r.quality_decision?.excerpt && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.quality_decision.excerpt}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <ScoreChip label="Relevance" value={r.relevance_score} />
                  <ScoreChip label="Quality" value={r.quality_score} />
                  {r.sentiment && <Badge variant="outline">{r.sentiment}</Badge>}
                  {r.quality_decision?.isSatire && (
                    <Badge className="bg-amber-500 text-white">satire</Badge>
                  )}
                  {(r.auto_publish_blocked_reasons ?? []).map((reason) => (
                    <Badge key={reason} variant="outline">
                      {reason}
                    </Badge>
                  ))}
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  r.quality_status === 'review'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-red-500 text-red-600'
                }
              >
                {r.quality_status ?? 'pending'}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-4xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.quality_decision?.title || selected.title}</DialogTitle>
              </DialogHeader>
              <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto border-t border-b py-4">
                <div className="flex flex-wrap gap-2">
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
                </div>

                {selected.quality_decision?.warnings.length ? (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {selected.quality_decision.warnings.join(' • ')}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Title
                    </span>
                    {selected.quality_decision?.title &&
                      selected.quality_decision.title !== selected.title && (
                        <Badge variant="outline">
                          {(diffChangeRatio(selected.title, selected.quality_decision.title) * 100).toFixed(0)}% rewritten
                        </Badge>
                      )}
                  </div>
                  <div className="mb-4">
                    <InlineDiff
                      before={selected.title}
                      after={selected.quality_decision?.title ?? selected.title}
                    />
                  </div>

                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Body
                    </span>
                    {selected.quality_decision?.cleanedBody && (
                      <Badge variant="outline">
                        {(diffChangeRatio(selected.content ?? '', selected.quality_decision.cleanedBody) * 100).toFixed(0)}% rewritten
                      </Badge>
                    )}
                  </div>
                  <InlineDiff
                    before={(selected.content ?? '').slice(0, 4000)}
                    after={(selected.quality_decision?.cleanedBody ?? selected.content ?? '').slice(0, 4000)}
                  />
                </div>

                {selected.quality_decision?.removedArtifacts.length ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Removed artefacts
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selected.quality_decision.removedArtifacts.map((a) => (
                        <Badge key={a} variant="outline">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selected.quality_decision?.tags.length ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Suggested tags
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selected.quality_decision.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <DialogFooter className="justify-between">
                <Button
                  variant="ghost"
                  onClick={() => revert.mutate(selected)}
                  disabled={revert.isPending}
                >
                  <RotateCcw size={16} className="mr-2" />
                  Revert to original
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-red-500 text-red-600"
                    onClick={() => markIrrelevant.mutate(selected)}
                    disabled={markIrrelevant.isPending}
                  >
                    <EyeOff size={16} className="mr-2" />
                    Mark irrelevant
                  </Button>
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => approve.mutate(selected)}
                    disabled={approve.isPending}
                  >
                    <CheckCircle2 size={16} className="mr-2" />
                    Approve & publish
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
