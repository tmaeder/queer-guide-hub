import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Play, RefreshCw } from '@/components/icons';
import { toast } from 'sonner';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { AdminRegistryFrame } from '@/components/admin/frames/AdminRegistryFrame';
import {
  AdminSimpleTable,
  type AdminSimpleColumn,
} from '@/components/admin/primitives/AdminSimpleTable';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SOURCE_REGISTRIES,
  fetchDataSources,
  filterDataSources,
  runDataSource,
  saveSource,
  setSourceEnabled,
  sourceHealth,
  sourceKey,
  supportsManualSourceRun,
  type DataSource,
  type SourceEdits,
  type SourceFilters,
  type SourceHealth,
} from '@/lib/adminDataSources';

const DEFAULT_FILTERS: SourceFilters = {
  search: '',
  registry: 'all',
  type: 'all',
  enabled: 'all',
  health: 'all',
};
const HEALTH_LABELS: Record<SourceHealth, string> = {
  disabled: 'Disabled',
  paused: 'Auto-paused',
  failing: 'Errors',
  never: 'No successful run',
  stale: 'Stale',
  healthy: 'Healthy',
};
const PAGE_SIZE = 50;

function relativeDate(value: string | null): string {
  if (!value) return 'Never';
  if (!Number.isFinite(Date.parse(value))) return 'Unknown';
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

function sourceSchedule(source: DataSource): string {
  return (
    source.schedule ||
    (source.intervalHours ? `Every ${source.intervalHours} hours` : 'Not recorded')
  );
}

function safeSourceUrl(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 max-w-full rounded-element border border-input bg-background px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </select>
    </label>
  );
}

function SourceDialog({
  source,
  onClose,
  onSaved,
}: {
  source: DataSource;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [edits, setEdits] = useState<SourceEdits>({
    name: source.name,
    url: source.url ?? '',
    category: source.category ?? '',
    fetchFrequency: String(source.fetchFrequency ?? 120),
  });
  const save = useMutation({
    mutationFn: () => saveSource(source, edits),
    onSuccess: async () => {
      await onSaved();
      toast.success('Source updated');
      onClose();
    },
  });
  const field = (key: keyof SourceEdits, value: string) => {
    setEdits((previous) => ({ ...previous, [key]: value }));
    save.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage {source.name}</DialogTitle>
          <DialogDescription>
            {SOURCE_REGISTRIES[source.registry]} · {source.type}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Identifier</dt>
          <dd className="break-all">{source.identifier}</dd>
          <dt className="text-muted-foreground">Target</dt>
          <dd>{source.target}</dd>
          <dt className="text-muted-foreground">Schedule</dt>
          <dd>{sourceSchedule(source)}</dd>
          <dt className="text-muted-foreground">Last run</dt>
          <dd>{source.lastRun ? new Date(source.lastRun).toLocaleString() : 'Never'}</dd>
          <dt className="text-muted-foreground">Last success</dt>
          <dd>{source.lastSuccess ? new Date(source.lastSuccess).toLocaleString() : 'Never'}</dd>
          <dt className="text-muted-foreground">Items fetched</dt>
          <dd>{source.fetched.toLocaleString()}</dd>
          {source.edgeFunction && (
            <>
              <dt className="text-muted-foreground">Import function</dt>
              <dd className="break-all">{source.edgeFunction}</dd>
            </>
          )}
        </dl>
        {(source.lastError || source.autoPaused || source.failures > 0) && (
          <Alert variant="destructive">
            <AlertDescription className="whitespace-pre-wrap break-words">
              {source.autoPaused && (
                <p>
                  Automatically paused. Enabling this registration does not clear its health pause.
                </p>
              )}
              {source.pauseReason && <p>{source.pauseReason}</p>}
              {source.lastError && <p>{source.lastError}</p>}
              {source.failures > 0 && <p>{source.failures} consecutive failures</p>}
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={save.isPending} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="source-name">Name</Label>
              <Input
                id="source-name"
                value={edits.name}
                onChange={(e) => field('name', e.target.value)}
                required
              />
            </div>
            {source.registry !== 'ingestion_sources' && (
              <div className="space-y-2">
                <Label htmlFor="source-url">Source URL</Label>
                <Input
                  id="source-url"
                  type="url"
                  value={edits.url}
                  onChange={(e) => field('url', e.target.value)}
                  required
                />
              </div>
            )}
            {source.registry === 'news_sources' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="source-category">Category</Label>
                  <Input
                    id="source-category"
                    value={edits.category}
                    onChange={(e) => field('category', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-frequency">Fetch frequency (minutes)</Label>
                  <Input
                    id="source-frequency"
                    type="number"
                    min={1}
                    step={1}
                    value={edits.fetchFrequency}
                    onChange={(e) => field('fetchFrequency', e.target.value)}
                    required
                  />
                </div>
              </>
            )}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Recurring schedules are managed in{' '}
            <Link className="underline" to="/admin/automation">
              Automations
            </Link>
            .
          </p>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              aria-label="Save changes"
              loading={save.isPending}
              disabled={save.isPending}
            >
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDataSources() {
  const { isAdmin, loading: rolesLoading } = useAdminRoles();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => ({
    ...DEFAULT_FILTERS,
    registry: Object.hasOwn(SOURCE_REGISTRIES, searchParams.get('registry') ?? '')
      ? searchParams.get('registry')!
      : 'all',
  }));
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<DataSource | null>(null);
  const query = useQuery({
    queryKey: ['admin-data-sources'],
    queryFn: ({ signal }) => fetchDataSources(signal),
    enabled: isAdmin && !rolesLoading,
    refetchInterval: 30_000,
  });
  const refresh = async () => {
    await Promise.all(
      [
        ['admin-data-sources'],
        ['scrape-sources'],
        ['news-sources'],
        ['news-sources-health'],
        ['admin-news-sources'],
        ['ingestion-sources'],
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };
  const action = useMutation({
    mutationFn: async ({ source, kind }: { source: DataSource; kind: 'toggle' | 'run' }) => {
      if (!isAdmin) throw new Error('Administrator access required.');
      if (kind === 'toggle') await setSourceEnabled(source, !source.enabled);
      else await runDataSource(source);
    },
    onSuccess: async (_, { source, kind }) => {
      await refresh();
      toast.success(
        kind === 'run'
          ? `${source.name} import requested`
          : `${source.name} ${source.enabled ? 'disabled' : 'enabled'}`,
      );
    },
    onError: (error) => toast.error(error.message),
  });
  const sources = query.data ?? [];
  const filtered = filterDataSources(sources, filters);
  const types = [...new Set(sources.map((source) => source.type))].sort();
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const changeFilter = (key: keyof SourceFilters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(0);
  };
  const columns: AdminSimpleColumn<DataSource>[] = [
    {
      key: 'name',
      header: 'Source',
      render: (source) => (
        <div className="w-64 min-w-0 space-y-0.5 xl:w-80">
          <button
            className="block max-w-full truncate text-left font-bold underline-offset-4 hover:underline"
            onClick={() => setSelected(source)}
            title={source.name}
          >
            {source.name}
          </button>
          <div className="truncate text-xs text-muted-foreground">
            {safeSourceUrl(source.url) ? (
              <a
                href={safeSourceUrl(source.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                title={source.url ?? undefined}
              >
                {source.url}
              </a>
            ) : (
              <span title={source.identifier ?? undefined}>{source.identifier}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cellClassName: 'whitespace-nowrap',
      render: (source) => (
        <Badge
          variant="outline"
          className="max-w-48 truncate px-2 py-0 text-2xs font-normal"
          title={`${SOURCE_REGISTRIES[source.registry]} · ${source.type}`}
        >
          {SOURCE_REGISTRIES[source.registry]} · {source.type}
        </Badge>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (source) => <span className="text-xs">{source.target}</span>,
    },
    {
      key: 'health',
      header: 'Health',
      render: (source) => {
        const health = sourceHealth(source);
        return (
          <div className="max-w-64 space-y-1">
            <Badge
              variant={health === 'failing' || health === 'paused' ? 'destructive' : 'outline'}
            >
              {HEALTH_LABELS[health]}
            </Badge>
            {(source.lastError || source.pauseReason) && (
              <p
                className="line-clamp-2 break-words text-xs text-destructive"
                title={source.lastError ?? source.pauseReason ?? undefined}
              >
                {source.lastError || source.pauseReason}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'run',
      header: 'Last run / schedule',
      render: (source) => (
        <div className="min-w-36 space-y-1">
          <div title={source.lastRun ?? undefined}>{relativeDate(source.lastRun)}</div>
          <div className="text-xs text-muted-foreground">{sourceSchedule(source)}</div>
        </div>
      ),
    },
    {
      key: 'enabled',
      header: 'Enabled',
      render: (source) => (
        <Switch
          aria-label={`Enable ${source.name} (${SOURCE_REGISTRIES[source.registry]})`}
          checked={source.enabled}
          disabled={action.isPending}
          onCheckedChange={() => action.mutate({ source, kind: 'toggle' })}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (source) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label={`Manage ${source.name}`}
            onClick={() => setSelected(source)}
          >
            Manage
          </Button>
          {supportsManualSourceRun(source) && (
            <Button
              size="sm"
              variant="outline"
              aria-label={`Run ${source.name} now`}
              disabled={!source.enabled || action.isPending}
              loading={
                action.isPending &&
                action.variables?.kind === 'run' &&
                sourceKey(action.variables.source) === sourceKey(source)
              }
              onClick={() => action.mutate({ source, kind: 'run' })}
            >
              <Play size={14} />
              Run now
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (!rolesLoading && !isAdmin) {
    return (
      <AdminRegistryFrame title="Data sources">
        <p className="p-4" role="alert">
          Administrator access required.
        </p>
      </AdminRegistryFrame>
    );
  }

  return (
    <AdminRegistryFrame
      title="Data sources"
      actions={
        <>
          <Button asChild variant="outline">
            <Link to="/admin/pipelines?tab=sources">Advanced source tools</Link>
          </Button>
          <Button
            aria-label="Refresh data sources"
            variant="outline"
            disabled={query.isFetching || rolesLoading}
            onClick={() => void query.refetch()}
            loading={query.isFetching}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        </>
      }
      filters={
        <div className="flex w-full flex-col gap-4">
          <div className="max-w-2xl space-y-1">
            <Label htmlFor="source-search">Search sources</Label>
            <Input
              id="source-search"
              type="search"
              placeholder="Name, URL, identifier or target…"
              value={filters.search}
              onChange={(e) => changeFilter('search', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Registry"
              value={filters.registry}
              onChange={(value) => changeFilter('registry', value)}
            >
              <option value="all">All registries</option>
              {Object.entries(SOURCE_REGISTRIES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Source type"
              value={filters.type}
              onChange={(value) => changeFilter('type', value)}
            >
              <option value="all">All types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Enabled status"
              value={filters.enabled}
              onChange={(value) => changeFilter('enabled', value)}
            >
              <option value="all">All statuses</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </FilterSelect>
            <FilterSelect
              label="Health"
              value={filters.health}
              onChange={(value) => changeFilter('health', value)}
            >
              <option value="all">All health</option>
              {Object.entries(HEALTH_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </FilterSelect>
          </div>
        </div>
      }
    >
      <p className="px-4 py-4 text-sm text-muted-foreground">
        All registered scrapers, API imports and news feeds. Each registration has its own controls.
      </p>
      {query.error && (
        <Alert variant="destructive" className="mb-4" role="alert">
          <AlertDescription>
            Could not load all data sources: {query.error.message}.{' '}
            {query.data ? 'Showing the last loaded list. ' : ''}
            <button className="underline" onClick={() => void query.refetch()}>
              Retry
            </button>
          </AlertDescription>
        </Alert>
      )}
      {(query.data || !query.error) && (
        <>
          {query.data && (
            <p className="px-4 pb-4 text-sm" aria-live="polite">
              {sources.length} sources · {sources.filter((s) => s.enabled).length} enabled ·{' '}
              {
                sources.filter((s) => ['failing', 'paused', 'stale'].includes(sourceHealth(s)))
                  .length
              }{' '}
              need attention
            </p>
          )}
          <AdminSimpleTable
            caption="All data sources"
            columns={columns}
            rows={filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)}
            rowKey={sourceKey}
            isLoading={query.isLoading || rolesLoading}
            emptyNoun="data sources"
            filtered={
              filters.search !== '' ||
              [filters.registry, filters.type, filters.enabled, filters.health].some(
                (value) => value !== 'all',
              )
            }
            onResetFilters={() => {
              setFilters(DEFAULT_FILTERS);
              setPage(0);
            }}
          />
          {query.data && (
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 text-sm">
              <span aria-live="polite">
                {filtered.length === 0
                  ? '0'
                  : `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)}`}{' '}
                of {filtered.length} matching sources
              </span>
              {filtered.length > PAGE_SIZE && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(currentPage + 1) * PAGE_SIZE >= filtered.length}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {selected && isAdmin && (
        <SourceDialog
          key={sourceKey(selected)}
          source={selected}
          onClose={() => setSelected(null)}
          onSaved={refresh}
        />
      )}
    </AdminRegistryFrame>
  );
}
