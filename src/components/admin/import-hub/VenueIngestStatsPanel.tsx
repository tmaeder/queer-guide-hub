import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { supabase } from '@/integrations/supabase/client';
import {
  useVenueIngestStats,
  useVenueIngestRecentEvents,
  useVenueIngestHealthSnapshot,
  useVenueIngestDuplicateSummary,
} from '@/hooks/useVenueIngestStats';

export function VenueIngestStatsPanel() {
  const stats = useVenueIngestStats();
  const events = useVenueIngestRecentEvents();
  const dupes = useVenueIngestDuplicateSummary();
  const health = useVenueIngestHealthSnapshot();
  const [replayPattern, setReplayPattern] = useState('');
  const [replayBusy, setReplayBusy] = useState(false);
  const { toast } = useToast();
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
      toast({ title: 'Replay failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setReplayBusy(false);
    }
  };

  // Aggregate totals across the full window
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Pipeline Health Snapshot */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Pipeline Health
          </Typography>
          {health.isLoading ? (
            <CircularProgress size={20} aria-label="Loading" />
          ) : (health.data ?? []).length === 0 ? (
            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>No data.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(9, 1fr)', gap: 1, fontSize: '0.72rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span>Target</span><span>Total</span><span>Pending</span><span>Rejected</span><span>Review</span>
                <span>Stuck Norm</span><span>Stuck Val</span><span>Stuck Dedup</span><span>Stuck Commit</span><span>Review Stale</span>
              </Box>
              {(health.data ?? []).map((h) => {
                const anyStuck = h.stuck_normalize + h.stuck_validate + h.stuck_dedup + h.stuck_commit + h.review_stale;
                return (
                  <Box key={h.target_table} sx={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(9, 1fr)', gap: 1, fontSize: '0.85rem', py: 0.75, borderTop: '1px solid var(--border)' }}>
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
                  </Box>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Dead-letter replay */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            Replay Rejected Items
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--muted-foreground)', mb: 2 }}>
            Enter an error-message substring to reset matching venue rejects back to <code>pending</code>. Up to 200 per click.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Input
              placeholder='e.g. "category_check" or "venue_subtype"'
              value={replayPattern}
              onChange={(e) => setReplayPattern(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button onClick={runReplay} disabled={replayBusy || !replayPattern.trim()}>
              {replayBusy ? 'Replaying…' : 'Replay'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Funnel */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Venue Ingest Funnel (last 60 days)
          </Typography>
          {stats.isLoading ? (
            <CircularProgress size={20} aria-label="Loading" />
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
              {funnelSteps.map((s) => (
                <Box key={s.label} sx={{ p: 2, backgroundColor: 'var(--muted)' }}>
                  <Typography variant="caption" sx={{ color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {s.label}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                    {s.value.toLocaleString()}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Duplicates per source */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Flagged Duplicates by Source
          </Typography>
          {dupes.isLoading ? (
            <CircularProgress size={20} aria-label="Loading" />
          ) : (dupes.data ?? []).length === 0 ? (
            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>
              No duplicates flagged.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {(dupes.data ?? []).map((d) => (
                <Badge key={d.slug} variant="outline">
                  {d.slug}: {d.duplicates}
                </Badge>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Per-source per-day breakdown */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Per-Source Daily Breakdown
          </Typography>
          {stats.isLoading ? (
            <CircularProgress size={20} aria-label="Loading" />
          ) : (stats.data ?? []).length === 0 ? (
            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>No activity.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr repeat(6, 80px)', gap: 1, fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span>Day</span><span>Source</span><span>Staged</span><span>Valid</span><span>Unique</span><span>Dups</span><span>Inserted</span><span>Rejected</span>
              </Box>
              {(stats.data ?? []).slice(0, 30).map((r, i) => (
                <Box key={`${r.day}-${r.source}-${i}`} sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr repeat(6, 80px)', gap: 1, fontSize: '0.8rem', py: 0.5, borderTop: i === 0 ? undefined : '1px solid var(--border)' }}>
                  <span>{new Date(r.day).toLocaleDateString()}</span>
                  <span>{r.source}</span>
                  <span>{r.staged}</span>
                  <span>{r.validated}</span>
                  <span>{r.unique_items}</span>
                  <span>{r.duplicates}</span>
                  <span>{r.inserted}</span>
                  <span>{r.rejected}</span>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Recent audit events */}
      <Card>
        <CardContent style={{ padding: 24 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Recent Pipeline Events
          </Typography>
          {events.isLoading ? (
            <CircularProgress size={20} aria-label="Loading" />
          ) : (events.data ?? []).length === 0 ? (
            <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>No events.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {(events.data ?? []).map((e) => (
                <Box key={e.id} sx={{ display: 'grid', gridTemplateColumns: '160px 100px 100px 120px 1fr', gap: 1, fontSize: '0.8rem', py: 0.5 }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>{new Date(e.created_at).toLocaleString()}</span>
                  <span><Badge variant="outline">{e.stage}</Badge></span>
                  <span>{e.new_status}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>{e.actor}</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.payload ? JSON.stringify(e.payload).slice(0, 120) : '—'}
                  </span>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
