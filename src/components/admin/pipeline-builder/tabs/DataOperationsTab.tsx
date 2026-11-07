import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistance, format } from 'date-fns';
import { Link } from 'react-router';
import {
  AdminSimpleTable,
  type AdminSimpleColumn,
} from '@/components/admin/primitives/AdminSimpleTable';
import { AdminStatTile } from '@/components/admin/primitives/AdminStatTile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { untypedSupabase } from '@/integrations/supabase/untyped';

const REGISTRIES = {
  adapter: { label: 'Ingestion adapter', href: null },
  scraper: { label: 'Scrape source', href: '/admin/pipelines?tab=sources' },
  feed: { label: 'News or podcast feed', href: '/admin/news-sources' },
  automation: { label: 'Registered automation', href: '/admin/automation' },
  cron: { label: 'Unregistered cron job', href: null },
} as const;

const STATES = {
  attention: { label: 'Needs attention', rank: 0 },
  paused: { label: 'Auto-paused', rank: 1 },
  running: { label: 'Running', rank: 2 },
  unobserved: { label: 'No confirmed success', rank: 3 },
  active: { label: 'Active', rank: 4 },
  inactive: { label: 'Inactive', rank: 5 },
} as const;

interface Entry {
  kind: keyof typeof REGISTRIES;
  id: string;
  name: string;
  identifier: string | null;
  target: string | null;
  cadence: string | null;
  activity_at: string | null;
  success_at: string | null;
  state: keyof typeof STATES;
  note: string | null;
}

interface Snapshot {
  observed_at: string;
  entries: Entry[];
}

const PAGE_SIZE = 25;
const EMPTY_ENTRIES: Entry[] = [];
const selectClass = 'h-9 rounded-element border border-input bg-background px-2 text-sm';
const linkClass = 'text-primary font-medium underline-offset-4 hover:underline';

function isAutomation(entry: Entry) {
  return entry.kind === 'automation' || entry.kind === 'cron';
}

function activityTime(value: string, snapshotTime: string) {
  const date = new Date(value);
  return (
    <time dateTime={value} title={format(date, 'PPpp')} className="whitespace-nowrap">
      {formatDistance(date, new Date(snapshotTime), { addSuffix: true })}
    </time>
  );
}

export default function DataOperationsTab() {
  const snapshot = useQuery({
    queryKey: ['admin-data-operations-overview'],
    queryFn: async ({ signal }) => {
      const { data, error } = await untypedSupabase
        .rpc('admin_data_operations_overview')
        .returns<Snapshot>()
        .abortSignal(signal);
      if (error) throw error;
      if (!data) throw new Error('The overview returned no snapshot');
      return data;
    },
    refetchInterval: 60_000,
  });

  const [search, setSearch] = useState('');
  const [registry, setRegistry] = useState('all');
  const [state, setState] = useState('all');
  const [sort, setSort] = useState('attention');
  const [page, setPage] = useState(0);

  const entries = snapshot.data?.entries ?? EMPTY_ENTRIES;
  const observedAt = snapshot.data?.observed_at;
  const automationCount = entries.filter(isAutomation).length;
  const attentionCount = entries.filter((entry) => entry.state === 'attention').length;
  const pausedCount = entries.filter((entry) => entry.state === 'paused').length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries
      .filter((entry) => {
        const matchesRegistry =
          registry === 'all' ||
          (registry === 'sources' && !isAutomation(entry)) ||
          (registry === 'automations' && isAutomation(entry)) ||
          entry.kind === registry;
        const matchesState = state === 'all' || entry.state === state;
        const matchesSearch =
          !term ||
          [entry.name, entry.identifier, entry.target, entry.note].some((value) =>
            value?.toLowerCase().includes(term),
          );
        return matchesRegistry && matchesState && matchesSearch;
      })
      .sort((a, b) => {
        if (sort === 'attention' && a.state !== b.state) {
          return STATES[a.state].rank - STATES[b.state].rank;
        }
        if (sort === 'activity') {
          const activity =
            (Date.parse(b.activity_at ?? '') || 0) - (Date.parse(a.activity_at ?? '') || 0);
          if (activity) return activity;
        }
        return a.name.localeCompare(b.name);
      });
  }, [entries, search, registry, state, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const offset = currentPage * PAGE_SIZE;
  const visible = filtered.slice(offset, offset + PAGE_SIZE);

  function resetFilters() {
    setSearch('');
    setRegistry('all');
    setState('all');
    setPage(0);
  }

  const columns: AdminSimpleColumn<Entry>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (entry) => (
        <>
          <div className="font-medium">{entry.name}</div>
          {entry.identifier && entry.identifier !== entry.name && (
            <div className="break-all text-xs text-muted-foreground">{entry.identifier}</div>
          )}
        </>
      ),
    },
    {
      key: 'registry',
      header: 'Registry',
      width: 'lg',
      render: (entry) => (
        <>
          {REGISTRIES[entry.kind].label}
          {entry.target && <div className="text-xs text-muted-foreground">{entry.target}</div>}
        </>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      width: 'xl',
      render: (entry) => (
        <>
          <Badge variant={entry.state === 'attention' ? 'destructive' : 'secondary'}>
            {STATES[entry.state].label}
          </Badge>
          {entry.note && <p className="mt-1 text-xs text-muted-foreground">{entry.note}</p>}
        </>
      ),
    },
    {
      key: 'cadence',
      header: 'Cadence / trigger',
      width: 'md',
      render: (entry) => entry.cadence ?? '—',
    },
    {
      key: 'activity',
      header: 'Last activity',
      width: 'lg',
      render: (entry) => (
        <>
          {entry.activity_at && observedAt ? activityTime(entry.activity_at, observedAt) : '—'}
          {entry.success_at && observedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Success {activityTime(entry.success_at, observedAt)}
            </p>
          )}
        </>
      ),
    },
    {
      key: 'manage',
      header: 'Manage',
      width: 'xs',
      render: (entry) => {
        const href =
          entry.kind === 'automation' && entry.identifier
            ? `/admin/automation?automation=${encodeURIComponent(entry.identifier)}`
            : REGISTRIES[entry.kind].href;
        const action = entry.kind === 'automation' ? 'Manage' : 'Open';
        const label =
          action === 'Manage' ? `${action} ${entry.name}` : `${action} registry for ${entry.name}`;
        return href ? (
          <Link to={href} className={linkClass} aria-label={label}>
            {action}
          </Link>
        ) : (
          '—'
        );
      },
    },
  ];

  return (
    <section aria-labelledby="data-operations-heading" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="data-operations-heading" className="text-title font-semibold">
            Data operations
          </h2>
          <p className="text-sm text-muted-foreground">
            Browse database-registered ingestion sources and automations alongside the jobs in
            pg_cron.
          </p>
          {observedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Snapshot taken{' '}
              <time dateTime={observedAt}>{format(new Date(observedAt), 'PPpp')}</time>
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void snapshot.refetch()}
          disabled={snapshot.isFetching}
        >
          {snapshot.isFetching ? 'Refreshing…' : 'Refresh overview'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AdminStatTile
          label="Source entries"
          value={snapshot.data ? entries.length - automationCount : '—'}
        />
        <AdminStatTile
          label="Automations & cron jobs"
          value={snapshot.data ? automationCount : '—'}
        />
        <AdminStatTile
          label="Needs attention"
          value={snapshot.data ? attentionCount : '—'}
          alert={attentionCount > 0}
        />
        <AdminStatTile label="Auto-paused" value={snapshot.data ? pausedCount : '—'} />
      </div>

      <nav aria-label="Data operations tools" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link className={linkClass} to="/admin/pipelines?tab=sources">
          Source registry
        </Link>
        <Link className={linkClass} to="/admin/news-sources">
          News and podcast sources
        </Link>
        <Link className={linkClass} to="/admin/automation">
          Automation registry
        </Link>
        <Link className={linkClass} to="/admin/pipelines?tab=health">
          Run monitoring
        </Link>
        <Link className={linkClass} to="/admin/inbox?queue=dedup-review">
          Dedup decisions
        </Link>
      </nav>

      {snapshot.isError && (
        <p
          role="alert"
          className="rounded-element border border-destructive/30 p-4 text-sm text-destructive"
        >
          {snapshot.data
            ? 'Refresh failed. The table shows the last successful snapshot.'
            : 'Could not load the data operations overview. Use Refresh overview to try again.'}
        </p>
      )}

      {(!snapshot.isError || snapshot.data) && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label
              htmlFor="data-operations-search"
              className="min-w-44 flex-1 space-y-1 text-xs font-medium"
            >
              <span>Search inventory</span>
              <Input
                id="data-operations-search"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Registry
              <select
                className={selectClass}
                value={registry}
                onChange={(event) => {
                  setRegistry(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All registries</option>
                <option value="sources">All source entries</option>
                <option value="automations">All automations and jobs</option>
                {Object.entries(REGISTRIES).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Status
              <select
                className={selectClass}
                value={state}
                onChange={(event) => {
                  setState(event.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All statuses</option>
                {Object.entries(STATES).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Sort by
              <select
                className={selectClass}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(0);
                }}
              >
                <option value="attention">Attention first</option>
                <option value="activity">Latest activity</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          <AdminSimpleTable
            caption="Sources and automations inventory"
            columns={columns}
            rows={visible}
            rowKey={(entry) => `${entry.kind}:${entry.id}`}
            isLoading={snapshot.isPending}
            emptyNoun="entries"
            filtered={Boolean(search.trim()) || registry !== 'all' || state !== 'all'}
            onResetFilters={resetFilters}
          />

          {snapshot.data && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p aria-live="polite" className="text-muted-foreground">
                {filtered.length <= 1
                  ? filtered.length === 1
                    ? '1 entry'
                    : '0 entries'
                  : `${offset + 1}–${offset + visible.length} of ${filtered.length} entries`}
              </p>
              {pageCount > 1 && (
                <nav aria-label="Inventory pages" className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {currentPage + 1} of {pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage === pageCount - 1}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
