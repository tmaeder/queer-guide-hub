import { useEffect, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { callSearchIntelligence } from '@/hooks/useSearchIntelligence';
import {
  formatJobDuration,
  normalizeErrors,
  jobProgressPercent,
  anyJobInFlight,
} from '@/lib/reindexJob';

const INDEXES = [
  'venues',
  'events',
  'cities',
  'countries',
  'news',
  'marketplace',
  'personalities',
  'tags',
  'queer_villages',
  'hotels',
  'festivals',
];

interface ReindexJob {
  id: string;
  index_name: string;
  scope: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  errors: string[] | unknown;
  meili_task_uids: number[];
  triggered_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

const STATUS_VARIANT: Record<
  ReindexJob['status'],
  'default' | 'secondary' | 'destructive'
> = {
  pending: 'secondary',
  running: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'destructive',
};

export function ReindexTab() {
  const [index, setIndex] = useState('venues');
  const [jobs, setJobs] = useState<ReindexJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await callSearchIntelligence<ReindexJob[]>('reindex', {
      searchParams: { limit: '50' },
    });
    if (!res.success) setError(res.error);
    else {
      setJobs(res.data);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const start = async () => {
    if (!confirm(`Start full reindex of "${index}"? This pushes all rows to Meilisearch.`)) {
      return;
    }
    setRunning(true);
    setError(null);
    const res = await callSearchIntelligence<ReindexJob>('reindex', {
      method: 'POST',
      body: { index, scope: { full: true }, confirm: true, async: false },
    });
    if (!res.success) setError(res.error);
    setRunning(false);
    await refresh();
  };

  const startAsync = async () => {
    if (
      !confirm(
        `Start ASYNC reindex of "${index}"? Returns immediately; the worker keeps running. Use this for large indexes that may exceed the request timeout.`,
      )
    ) {
      return;
    }
    setRunning(true);
    setError(null);
    const res = await callSearchIntelligence('reindex', {
      method: 'POST',
      body: { index, scope: { full: true }, confirm: true, async: true },
    });
    if (!res.success) setError(res.error);
    setRunning(false);
    await refresh();
  };

  const hasRunning = anyJobInFlight(jobs);

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Trigger reindex
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Drives the existing <code>meilisearch-sync</code> function for the chosen index. The
            sync function paginates Postgres in 1000-row pages and upserts to Meilisearch in
            500-doc batches. A row is written to <code>search_reindex_jobs</code> for audit.
          </Typography>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ md: 'flex-end' }}
            sx={{ mt: 2 }}
          >
            <TextField
              select
              label="Index"
              value={index}
              onChange={(e) => setIndex(e.target.value)}
              sx={{ minWidth: 200 }}
            >
              {INDEXES.map((ix) => (
                <MenuItem key={ix} value={ix}>
                  {ix}
                </MenuItem>
              ))}
            </TextField>
            <Button onClick={start} disabled={running}>
              {running ? 'Reindexing…' : 'Reindex (sync)'}
            </Button>
            <Button onClick={startAsync} disabled={running} variant="outline">
              Reindex (async)
            </Button>
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">Recent jobs</Typography>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </Stack>
        {hasRunning && (
          <Alert severity="info" sx={{ mb: 2 }}>
            A reindex is currently running. Click Refresh to update progress.
          </Alert>
        )}
        {jobs.length === 0 ? (
          <Typography color="text.secondary">No reindex jobs yet.</Typography>
        ) : (
          <Stack spacing={1}>
            {jobs.map((job) => {
              const errors = normalizeErrors(job.errors);
              const pct = jobProgressPercent(job);
              return (
                <Card key={job.id}>
                  <CardContent>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      spacing={2}
                    >
                      <Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                          <Typography variant="subtitle2">{job.index_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            · {new Date(job.created_at).toLocaleString()}
                          </Typography>
                        </Stack>
                        <Stack
                          direction="row"
                          spacing={2}
                          sx={{ mt: 0.5, color: 'text.secondary' }}
                        >
                          <Typography variant="caption">
                            processed {job.processed.toLocaleString()}
                            {job.total > 0 ? ` / ${job.total.toLocaleString()}` : ''}
                          </Typography>
                          <Typography variant="caption">
                            duration {formatJobDuration(job.started_at, job.finished_at)}
                          </Typography>
                        </Stack>
                      </Box>
                      {job.status === 'running' && pct !== null && (
                        <Box sx={{ minWidth: 160 }}>
                          <LinearProgress variant="determinate" value={pct} />
                          <Typography variant="caption" color="text.secondary">
                            {pct}%
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                    {errors.length > 0 && (
                      <Alert severity="error" sx={{ mt: 1.5 }}>
                        {errors.map((e, i) => (
                          <Typography key={i} variant="caption" component="div">
                            {e}
                          </Typography>
                        ))}
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
