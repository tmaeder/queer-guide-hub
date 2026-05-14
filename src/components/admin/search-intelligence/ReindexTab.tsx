import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <h6 className="text-lg font-semibold mb-2">Trigger reindex</h6>
          <p className="text-sm text-muted-foreground mb-2">
            Drives the existing <code>meilisearch-sync</code> function for the chosen index. The
            sync function paginates Postgres in 1000-row pages and upserts to Meilisearch in
            500-doc batches. A row is written to <code>search_reindex_jobs</code> for audit.
          </p>
          <div className="flex flex-col md:flex-row gap-4 md:items-end mt-4">
            <div className="flex flex-col gap-2 min-w-[200px]">
              <Label htmlFor="reindex-index">Index</Label>
              <Select value={index} onValueChange={setIndex}>
                <SelectTrigger id="reindex-index">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INDEXES.map((ix) => (
                    <SelectItem key={ix} value={ix}>
                      {ix}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={start} disabled={running}>
              {running ? 'Reindexing…' : 'Reindex (sync)'}
            </Button>
            <Button onClick={startAsync} disabled={running} variant="outline">
              Reindex (async)
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h6 className="text-lg font-semibold">Recent jobs</h6>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
        {hasRunning && (
          <Alert className="mb-4">
            <AlertDescription>
              A reindex is currently running. Click Refresh to update progress.
            </AlertDescription>
          </Alert>
        )}
        {jobs.length === 0 ? (
          <p className="text-muted-foreground">No reindex jobs yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((job) => {
              const errors = normalizeErrors(job.errors);
              const pct = jobProgressPercent(job);
              return (
                <Card key={job.id}>
                  <CardContent>
                    <div className="flex flex-row justify-between items-center gap-4">
                      <div>
                        <div className="flex flex-row items-center gap-2">
                          <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                          <span className="text-sm font-medium">{job.index_name}</span>
                          <span className="text-xs text-muted-foreground">
                            · {new Date(job.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex flex-row gap-4 mt-1 text-muted-foreground">
                          <span className="text-xs">
                            processed {job.processed.toLocaleString()}
                            {job.total > 0 ? ` / ${job.total.toLocaleString()}` : ''}
                          </span>
                          <span className="text-xs">
                            duration {formatJobDuration(job.started_at, job.finished_at)}
                          </span>
                        </div>
                      </div>
                      {job.status === 'running' && pct !== null && (
                        <div className="min-w-[160px]">
                          <div className="h-1 w-full bg-muted rounded overflow-hidden">
                            <div
                              className="h-full bg-primary transition-[width]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{pct}%</span>
                        </div>
                      )}
                    </div>
                    {errors.length > 0 && (
                      <Alert variant="destructive" className="mt-3">
                        <AlertDescription>
                          {errors.map((e, i) => (
                            <div key={i} className="text-xs">
                              {e}
                            </div>
                          ))}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
