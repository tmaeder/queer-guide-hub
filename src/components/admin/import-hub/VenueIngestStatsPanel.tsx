import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useVenueIngestStats,
  useVenueIngestRecentEvents,
  useVenueIngestHealthSnapshot,
  useVenueIngestDuplicateSummary,
} from '@/hooks/useVenueIngestStats';

const Spinner = () => (
  <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" aria-label="Loading" />
);

export function VenueIngestStatsPanel() {
  const stats = useVenueIngestStats();
  const events = useVenueIngestRecentEvents();
  const dupes = useVenueIngestDuplicateSummary();
  const health = useVenueIngestHealthSnapshot();
  const [replayPattern, setReplayPattern] = useState('');
  const [replayBusy, setReplayBusy] = useState(false);
  const qc = useQueryClient();

  const runReplay = async () => {
    if (!replayPattern.trim()) return;
    setReplayBusy(true);
    try {
      const { data, error } = await supabase.rpc('replay_rejected_staging', {
        p_error_substring: replayPattern.trim(),
        p_target_table: 'venues',
        p_limit: 200,
      });
      if (error) throw error;
      const n = Array.isArray(data) ? data.length : 0;
      toast({ title: `Replayed ${n} rejected item${n === 1 ? '' : 's'}` });
      setReplayPattern('');
      qc.invalidateQueries({ queryKey: ['pipeline-health-snapshot'] });
      qc.invalidateQueries({ queryKey: ['venue-ingest-stats'] });
    } catch (e) {
      toast.error('Replay failed');
    } finally {
      setReplayBusy(false);
    }
  };

  const totals = (stats.data ?? []).reduce(
    (acc, r) => ({
      staged:         acc.staged + r.staged,
      validated:      acc.validated + r.validated,
      unique_items:   acc.unique_items + r.unique_items,
      duplicates:     acc.duplicates + r.duplicates,
      inserted:       acc.inserted + r.inserted,
      updated:        acc.updated + r.updated,
      rejected:       acc.rejected + r.rejected,
      pending_review: acc.pending_review + r.pending_review,
    }),
    { staged: 0, validated: 0, unique_items: 0, duplicates: 0, inserted: 0, updated: 0, rejected: 0, pending_review: 0 },
  );

  const funnelSteps = [
    { label: 'Staged',         value: totals.staged },
    { label: 'Validated',      value: totals.validated },
    { label: 'Unique',         value: totals.unique_items },
    { label: 'Inserted',       value: totals.inserted },
    { label: 'Updated',        value: totals.updated },
    { label: 'Pending Review', value: totals.pending_review },
    { label: 'Rejected',       value: totals.rejected },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Pipeline Health Snapshot */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <p className="font-semibold text-base mb-4">Pipeline Health</p>
          {health.isLoading ? (
            <Spinner />
          ) : (health.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid gap-2 text-[0.72rem] text-muted-foreground font-semibold uppercase tracking-wide" style={{ gridTemplateColumns: '1.2fr repeat(9, 1fr)' }}>
                <span>Target</span><span>Total</span><span>Pending</span><span>Rejected</span><span>Review</span>
                <span>Stuck Norm</span><span>Stuck Val</span><span>Stuck Dedup</span><span>Stuck Commit</span><span>Review Stale</span>
              </div>
              {(health.data ?? []).map((h) => {
                const anyStuck = h.stuck_normalize + h.stuck_validate + h.stuck_dedup + h.stuck_commit + h.review_stale;
                return (
                  <div key={h.target_table} className="grid gap-2 text-sm py-1.5 border-t border-border" style={{ gridTemplateColumns: '1.2fr repeat(9, 1fr)' }}>
                    <span style={{ fontWeight: 500 }}>{h.target_table}</span>
                    <span>{h.total.toLocaleString()}</span>
                    <span>{h.pending}</span>
                    <span style={{ color: h.rejected > 0 ? '#dc2626' : undefined }}>{h.rejected}</span>
                    <span style={{ color: h.review_pending > 0 ? '#ca8a04' : undefined }}>{h.review_pending}</span>
                    <span style={{ color: h.stuck_normalize > 0 ? '#dc2626' : undefined }}>{h.stuck_normalize}</span>
                    <span style={{ color: h.stuck_validate > 0 ? '#dc2626' : undefined }}>{h.stuck_validate}</span>
                    <span style={{ color: h.stuck_dedup > 0 ? '#dc2626' : undefined }}>{h.stuck_dedup}</span>
                    <span style={{ color: h.stuck_commit > 0 ? '#dc2626' : undefined }}>{h.stuck_commit}</span>
                    <span style={{ color: h.review_stale > 0 ? '#ca8a04' : undefined, fontWeight: anyStuck > 0 ? 600 : undefined }}>{h.review_stale}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dead-letter replay */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <p className="font-semibold text-base mb-2">Replay Rejected Items</p>
          <p className="text-sm text-muted-foreground mb-4">
            Enter an error-message substring to reset matching venue rejects back to <code>pending</code>. Up to 200 per click.
          </p>
          <div className="flex gap-2 items-center">
            <Input
              placeholder='e.g. "category_check" or "venue_subtype"'
              value={replayPattern}
              onChange={(e) => setReplayPattern(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button onClick={runReplay} disabled={replayBusy || !replayPattern.trim()}>
              {replayBusy ? 'Replaying…' : 'Replay'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Funnel */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <p className="font-semibold text-base mb-4">
            Venue Ingest Funnel (last 60 days)
          </p>
          {stats.isLoading ? (
            <Spinner />
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {funnelSteps.map((s) => (
                <div key={s.label} className="p-4 bg-muted rounded">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                  <p className="text-2xl font-bold mt-1">{s.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Duplicates per source */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <p className="font-semibold text-base mb-4">Flagged Duplicates by Source</p>
          {dupes.isLoading ? (
            <Spinner />
          ) : (dupes.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No duplicates flagged.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(dupes.data ?? []).map((d) => (
                <Badge key={d.slug} variant="outline">
                  {d.slug}: {d.duplicates}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-source per-day breakdown */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <p className="font-semibold text-base mb-4">Per-Source Daily Breakdown</p>
          {stats.isLoading ? (
            <Spinner />
          ) : (stats.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wide" style={{ gridTemplateColumns: '1.2fr 1fr repeat(6, 80px)' }}>
                <span>Day</span><span>Source</span><span>Staged</span><span>Valid</span><span>Unique</span><span>Dups</span><span>Inserted</span><span>Rejected</span>
              </div>
              {(stats.data ?? []).slice(0, 30).map((r, i) => (
                <div key={`${r.day}-${r.source}-${i}`} className="grid gap-2 text-[0.8rem] py-1" style={{ gridTemplateColumns: '1.2fr 1fr repeat(6, 80px)', borderTop: i === 0 ? undefined : '1px solid hsl(var(--border))' }}>
                  <span>{new Date(r.day).toLocaleDateString()}</span>
                  <span>{r.source}</span>
                  <span>{r.staged}</span>
                  <span>{r.validated}</span>
                  <span>{r.unique_items}</span>
                  <span>{r.duplicates}</span>
                  <span>{r.inserted}</span>
                  <span>{r.rejected}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent audit events */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <p className="font-semibold text-base mb-4">Recent Pipeline Events</p>
          {events.isLoading ? (
            <Spinner />
          ) : (events.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No events.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {(events.data ?? []).map((e) => (
                <div key={e.id} className="grid gap-2 text-[0.8rem] py-1" style={{ gridTemplateColumns: '160px 100px 100px 120px 1fr' }}>
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                  <span><Badge variant="outline">{e.stage}</Badge></span>
                  <span>{e.new_status}</span>
                  <span className="text-muted-foreground">{e.actor}</span>
                  <span className="font-mono text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                    {e.payload ? JSON.stringify(e.payload).slice(0, 120) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
