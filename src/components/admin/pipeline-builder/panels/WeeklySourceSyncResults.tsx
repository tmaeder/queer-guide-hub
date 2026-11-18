import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { SOURCE_REGISTRIES, type SourceRegistry } from '@/lib/adminDataSources';
import {
  AdminSimpleTable,
  type AdminSimpleColumn,
} from '@/components/admin/primitives/AdminSimpleTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SourceJob {
  id: string;
  registry: SourceRegistry;
  source_name: string;
  status: string;
  reason: string | null;
  required_settings: string[];
  attempts: number;
  interrupted_attempts: number;
  child_run_id: string | null;
  child_pipeline: string | null;
  items_fetched: number;
  items_staged: number;
}

const PAGE_SIZE = 50;
const STATUSES = [
  'all',
  'pending',
  'queued',
  'running',
  'waiting',
  'succeeded',
  'skipped',
  'blocked',
  'failed',
] as const;

const columns: AdminSimpleColumn<SourceJob>[] = [
  {
    key: 'name',
    header: 'Source',
    render: (row) => (
      <div>
        <div>{row.source_name}</div>
        <div className="text-xs text-muted-foreground">{SOURCE_REGISTRIES[row.registry]}</div>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <Badge variant={['blocked', 'failed'].includes(row.status) ? 'destructive' : 'outline'}>
        {row.status}
      </Badge>
    ),
  },
  {
    key: 'attempts',
    header: 'Attempts',
    align: 'right',
    render: (row) => (
      <span>
        {row.attempts}
        {row.interrupted_attempts > 0 && (
          <span className="block text-xs text-muted-foreground">
            {row.interrupted_attempts} interrupted
          </span>
        )}
      </span>
    ),
  },
  {
    key: 'fetched',
    header: 'Fetched',
    align: 'right',
    render: (row) =>
      row.child_run_id ? 'See source run' : Number(row.items_fetched).toLocaleString(),
  },
  {
    key: 'staged',
    header: 'Staged',
    align: 'right',
    render: (row) => (row.status === 'waiting' ? '—' : Number(row.items_staged).toLocaleString()),
  },
  {
    key: 'reason',
    header: 'Details',
    render: (row) => (
      <div className="min-w-40 whitespace-normal break-words">
        <div>{row.reason ?? (row.status === 'waiting' ? 'Waiting for source pipeline' : '—')}</div>
        {row.child_pipeline && (
          <div className="text-xs text-muted-foreground">
            {row.child_pipeline} · {row.child_run_id}
          </div>
        )}
        {row.required_settings?.length > 0 && (
          <div className="mt-1 text-xs">
            Needs:{' '}
            {row.required_settings
              .map((name) =>
                name === 'ingestion_sources.edge_function' ? 'Scheduled import adapter' : name,
              )
              .join(', ')}
          </div>
        )}
      </div>
    ),
  },
];

export default function WeeklySourceSyncResults({ runId }: { runId: string }) {
  const filterId = useId();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all');
  const [page, setPage] = useState(0);
  const { data, error, isLoading } = useQuery({
    queryKey: ['weekly-source-sync-results', runId, status, page],
    queryFn: async () => {
      let query = untypedFrom('weekly_source_sync_jobs')
        .select(
          'id,registry,source_name,status,reason,required_settings,attempts,interrupted_attempts,items_fetched,items_staged,child_run_id,child_pipeline',
          { count: 'exact' },
        )
        .eq('run_id', runId);
      if (status !== 'all') query = query.eq('status', status);
      const [jobs, run] = await Promise.all([
        query
          .order('registry')
          .order('source_name')
          .order('id')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
        untypedFrom('pipeline_runs').select('status,context').eq('id', runId).single(),
      ]);
      if (jobs.error || run.error)
        throw new Error('Could not load source outcomes. Administrator access is required.');
      return {
        rows: (jobs.data ?? []) as SourceJob[],
        total: jobs.count ?? 0,
        status: run.data.status as string,
        summary:
          (run.data.context as { weekly_summary?: Record<string, number> } | null)
            ?.weekly_summary ?? {},
      };
    },
    refetchInterval: (query) =>
      ['running', 'paused'].includes(query.state.data?.status ?? '') ? 5000 : false,
  });

  return (
    <section className="space-y-4" aria-label="Weekly source sync results">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">Source results</h3>
        <Link to="/admin/data-sources" className="text-xs underline">
          Manage data sources
        </Link>
      </div>
      {data && (
        <p className="text-xs text-muted-foreground" role="status">
          {data.summary.processed ?? 0} of {data.summary.sources ?? 0} sources processed ·{' '}
          {data.summary.succeeded ?? 0} succeeded · {data.summary.skipped ?? 0} skipped ·{' '}
          {data.summary.blocked ?? 0} blocked · {data.summary.failed ?? 0} failed.{' '}
          {Number(data.summary.records_staged ?? 0).toLocaleString()} records reported as staged.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Disabled and paused sources remain off. Credentials are configured in server settings; only
        their names appear here. Record counts include reported attempts; interrupted attempts may
        have incomplete counts.
      </p>
      <div className="flex items-center gap-2 text-xs">
        <label htmlFor={filterId}>Source status</label>
        <select
          id={filterId}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as typeof status);
            setPage(0);
          }}
          className="rounded-control border border-input bg-background px-2 py-1"
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <AdminSimpleTable
              caption="Per-source weekly sync outcomes"
              columns={columns}
              rows={data?.rows ?? []}
              rowKey={(row) => row.id}
              emptyNoun="source outcomes"
              isLoading={isLoading}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>
              {data?.total ?? 0} matching sources · page {page + 1}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || isLoading}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous sources
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isLoading || (page + 1) * PAGE_SIZE >= (data?.total ?? 0)}
                onClick={() => setPage((value) => value + 1)}
              >
                Next sources
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
