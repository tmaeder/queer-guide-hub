import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminSimpleTable } from '@/components/admin/primitives/AdminSimpleTable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import { exportNewsSources } from '@/lib/newsSourcesExport';
import { NewsSourceEditor } from './NewsSourceEditor';
import {
  NEWS_SOURCE_PAGE_SIZE,
  useNewsSourcesAdmin,
  useSourceArticles,
  useResumeNewsSource,
  useDeleteNewsSource,
  sourceError,
  type SourceRecord,
} from '@/hooks/useNewsSourcesAdmin';

export function SourcePager({
  page,
  total,
  busy,
  setPage,
}: {
  page: number;
  total: number;
  busy: boolean;
  setPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Source pagination"
      className="flex flex-wrap items-center justify-end gap-4 py-4"
    >
      <span className="text-13 tabular-nums">
        {total.toLocaleString()} {total === 1 ? 'record' : 'records'} · Page {page + 1}
      </span>
      <Button
        type="button"
        variant="outline"
        disabled={busy || page === 0}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy || (page + 1) * NEWS_SOURCE_PAGE_SIZE >= total}
        onClick={() => setPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
function LoadError({ label, retry }: { label: string; retry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 py-4">
      <p>Could not load {label}.</p>
      <Button type="button" variant="outline" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
function sourceStatus(source: SourceRecord) {
  if (!source.is_active) return 'Inactive';
  if (source.auto_paused) return 'Paused';
  if (source.consecutive_failures > 0) return 'Error';
  if (source.backoff_until && Date.parse(source.backoff_until) > Date.now()) return 'Backoff';
  return 'Active';
}
function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function NewsSourcesWorkspace({
  organizationId,
  organizationName,
  disabled = false,
  canManagePublishers = true,
  onSaved,
}: {
  organizationId?: string;
  organizationName?: string;
  disabled?: boolean;
  canManagePublishers?: boolean;
  onSaved?: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const [unlinked, setUnlinked] = useState(false);
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<{ source?: SourceRecord } | null>(null);
  const [selected, setSelected] = useState<SourceRecord | null>(null);
  const [articlePage, setArticlePage] = useState(0);
  const [linking, setLinking] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkPage, setLinkPage] = useState(0);
  const [resuming, setResuming] = useState<SourceRecord | null>(null);
  const [resumeError, setResumeError] = useState('');
  const [deleting, setDeleting] = useState<SourceRecord | null>(null);
  const [deleteName, setDeleteName] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const remove = useDeleteNewsSource();
  const list = useNewsSourcesAdmin({ search, state, unlinked, organizationId, page });
  const candidates = useNewsSourcesAdmin(
    { search: linkSearch, state: 'all', unlinked: false, page: linkPage },
    linking,
  );
  const articles = useSourceArticles(selected?.id ?? null, articlePage);
  const resume = useResumeNewsSource();
  const resumeSource = async () => {
    if (!resuming || disabled || resume.isPending) return;
    setResumeError('');
    try {
      await resume.mutateAsync(resuming);
      await onSaved?.();
      toast.success('Source is eligible for another ingestion attempt');
      setResuming(null);
    } catch (error) {
      setResumeError(sourceError(error));
    }
  };
  const deleteSource = async () => {
    if (!deleting || disabled || remove.isPending || deleteName !== deleting.name) return;
    setDeleteError('');
    try {
      await remove.mutateAsync(deleting);
      setPage(0);
      setSelected(null);
      await onSaved?.();
      setDeleting(null);
      toast.success('Source and its imported articles deleted');
    } catch (error) {
      setDeleteError(sourceError(error));
    }
  };
  return (
    <section aria-label="News sources" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor={`source-search-${organizationId ?? 'all'}`}>Search sources</Label>
            <Input
              id={`source-search-${organizationId ?? 'all'}`}
              value={search}
              placeholder="Feed, publisher or URL"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`source-state-${organizationId ?? 'all'}`}>Status</Label>
            <select
              id={`source-state-${organizationId ?? 'all'}`}
              className="h-11 rounded-element border border-input bg-background px-4 text-13"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(0);
              }}
            >
              {[
                ['all', 'All statuses'],
                ['active', 'Active'],
                ['inactive', 'Inactive'],
                ['paused', 'Automatically paused'],
                ['error', 'Fetch errors'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {!organizationId && (
            <label className="flex items-center gap-2 py-2 text-13">
              <input
                type="checkbox"
                className="size-4 accent-current"
                checked={unlinked}
                onChange={(e) => {
                  setUnlinked(e.target.checked);
                  setPage(0);
                }}
              />
              Unlinked publishers
            </label>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!organizationId && canManagePublishers && (
            <Button type="button" variant="outline" asChild>
              <Link to="/admin/content/organizations">Organisations</Link>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            Refresh
          </Button>
          <ExportExcelButton
            onExport={() => exportNewsSources({ search, state, unlinked, organizationId }, 'Excel')}
          />
          <ExportExcelButton
            format="CSV"
            onExport={() => exportNewsSources({ search, state, unlinked, organizationId }, 'CSV')}
          />
          {organizationId && canManagePublishers && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setLinking(true);
                setLinkPage(0);
              }}
            >
              Link existing source
            </Button>
          )}
          <Button type="button" disabled={disabled} onClick={() => setEditor({})}>
            Add source
          </Button>
        </div>
      </div>
      {list.isError ? (
        <LoadError label="news sources" retry={() => void list.refetch()} />
      ) : (
        <>
          <AdminSimpleTable
            caption="News sources and publishers"
            emptyNoun="news sources"
            filtered={!!search || state !== 'all' || unlinked}
            onResetFilters={() => {
              setSearch('');
              setState('all');
              setUnlinked(false);
              setPage(0);
            }}
            emptyDescription={
              organizationId
                ? 'Link an existing feed or add a source for this publisher.'
                : 'Add a feed to begin collecting articles.'
            }
            isLoading={list.isLoading}
            rows={list.data?.rows ?? []}
            rowKey={(s) => s.id}
            columns={[
              {
                key: 'name',
                header: 'Source',
                render: (s) => (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-left font-medium whitespace-normal"
                      disabled={disabled}
                      aria-label={`Edit ${s.name}`}
                      onClick={() => setEditor({ source: s })}
                    >
                      {s.name}
                    </Button>
                    <span className="block text-xs2 text-muted-foreground">
                      {s.source_type} · {s.feed_type} · every {s.fetch_frequency} min
                    </span>
                  </div>
                ),
              },
              ...(!organizationId
                ? [
                    {
                      key: 'publisher',
                      header: 'Publisher',
                      render: (s: SourceRecord) =>
                        s.organization_id && canManagePublishers ? (
                          <Link
                            className="underline underline-offset-4"
                            to={`/admin/content/organizations?edit=${s.organization_id}`}
                          >
                            {s.publisher_name ?? 'Organisation'}
                            {s.publisher_status === 'archived' ? ' (archived)' : ''}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            {s.publisher_name ?? 'Unlinked'}
                          </span>
                        ),
                    },
                  ]
                : []),
              {
                key: 'articles',
                header: 'Articles',
                align: 'right',
                render: (s) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${s.article_count.toLocaleString()} articles from ${s.name}`}
                    onClick={() => {
                      setSelected(s);
                      setArticlePage(0);
                    }}
                  >
                    {s.article_count.toLocaleString()}
                  </Button>
                ),
              },
              {
                key: 'health',
                header: 'Ingestion',
                render: (s) => (
                  <div className="space-y-2">
                    <p>{sourceStatus(s)}</p>
                    <p className="text-xs2 text-muted-foreground">
                      Last fetch: {dateLabel(s.last_fetched_at)}
                    </p>
                    <p className="text-xs2 text-muted-foreground">
                      Last success: {dateLabel(s.last_successful_fetch)}
                    </p>
                    {(s.auto_paused_reason || s.last_error) && (
                      <details>
                        <summary className="cursor-pointer text-xs2">Last error</summary>
                        <p className="max-w-sm break-words pt-2 text-13">
                          {s.auto_paused_reason ?? s.last_error}
                        </p>
                      </details>
                    )}
                  </div>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (s) => (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      aria-label={`Delete ${s.name}`}
                      onClick={() => {
                        setDeleting(s);
                        setDeleteName('');
                        setDeleteError('');
                      }}
                    >
                      Delete
                    </Button>
                    {(s.auto_paused || s.backoff_until) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        aria-label={`Resume ${s.name}`}
                        onClick={() => {
                          setResuming(s);
                          setResumeError('');
                        }}
                      >
                        Resume
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <SourcePager
            page={page}
            total={list.data?.total ?? 0}
            busy={list.isFetching}
            setPage={setPage}
          />
        </>
      )}
      {selected && (
        <section aria-label={`Articles from ${selected.name}`} className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-medium">Articles from {selected.name}</h3>
            <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
              Close articles
            </Button>
          </div>
          {articles.isError ? (
            <LoadError label="articles" retry={() => void articles.refetch()} />
          ) : (
            <>
              <AdminSimpleTable
                caption={`Articles from ${selected.name}`}
                emptyNoun="articles"
                isLoading={articles.isLoading}
                rows={articles.data?.rows ?? []}
                rowKey={(a) => a.id}
                columns={[
                  {
                    key: 'title',
                    header: 'Article',
                    render: (a) => (
                      <Link
                        className="underline underline-offset-4"
                        to={`/admin/content/news_articles?edit=${a.id}`}
                      >
                        {a.title}
                      </Link>
                    ),
                  },
                  {
                    key: 'published',
                    header: 'Published',
                    render: (a) => dateLabel(a.published_at),
                  },
                  {
                    key: 'quality',
                    header: 'Quality',
                    render: (a) => a.quality_status ?? 'Unreviewed',
                  },
                ]}
              />
              <SourcePager
                page={articlePage}
                total={articles.data?.total ?? 0}
                busy={articles.isFetching}
                setPage={setArticlePage}
              />
            </>
          )}
        </section>
      )}
      {editor && (
        <NewsSourceEditor
          source={editor.source}
          canManagePublishers={canManagePublishers}
          organizationId={editor.source ? undefined : organizationId}
          organizationName={organizationName}
          disabled={disabled}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setPage(0);
            setSelected(null);
            await onSaved?.();
          }}
        />
      )}
      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link an existing source</DialogTitle>
            <DialogDescription>
              Select a feed, then review its publisher assignment before saving.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="existing-source-search">Find a source</Label>
          <Input
            id="existing-source-search"
            value={linkSearch}
            onChange={(e) => {
              setLinkSearch(e.target.value);
              setLinkPage(0);
            }}
          />
          {candidates.isError ? (
            <LoadError label="sources" retry={() => void candidates.refetch()} />
          ) : (
            <>
              <AdminSimpleTable
                caption="Sources available to link"
                emptyNoun="sources"
                isLoading={candidates.isLoading}
                rows={candidates.data?.rows ?? []}
                rowKey={(s) => s.id}
                columns={[
                  { key: 'name', header: 'Source', render: (s) => s.name },
                  {
                    key: 'publisher',
                    header: 'Current publisher',
                    render: (s) => s.publisher_name ?? 'Unlinked',
                  },
                  {
                    key: 'choose',
                    header: 'Action',
                    render: (s) => (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={disabled || s.organization_id === organizationId}
                        onClick={() => {
                          setLinking(false);
                          setEditor({
                            source: {
                              ...s,
                              organization_id: organizationId ?? null,
                              publisher_name: organizationName ?? null,
                            },
                          });
                        }}
                      >
                        Review link
                      </Button>
                    ),
                  },
                ]}
              />
              <SourcePager
                page={linkPage}
                total={candidates.data?.total ?? 0}
                busy={candidates.isFetching}
                setPage={setLinkPage}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!resuming}
        onOpenChange={(open) => {
          if (!open && !resume.isPending) setResuming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume {resuming?.name}</DialogTitle>
            <DialogDescription>
              Clear the automatic pause and backoff so ingestion can retry this feed at its next
              scheduled run.
            </DialogDescription>
          </DialogHeader>
          {resumeError && (
            <p role="alert" className="text-13 text-destructive">
              {resumeError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={resume.isPending}
              onClick={() => setResuming(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={disabled || resume.isPending}
              onClick={() => void resumeSource()}
            >
              {resume.isPending ? 'Resuming…' : 'Confirm resume'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}</DialogTitle>
            <DialogDescription>
              This permanently deletes the feed and all {deleting?.article_count.toLocaleString()}{' '}
              of its imported articles. Disable the feed in its editor to retain article history.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="delete-source-name">Type the feed name to confirm</Label>
          <Input
            id="delete-source-name"
            value={deleteName}
            disabled={remove.isPending}
            onChange={(event) => setDeleteName(event.target.value)}
          />
          {deleteError && (
            <p role="alert" className="text-13 text-destructive">
              {deleteError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={disabled || remove.isPending || deleteName !== deleting?.name}
              onClick={() => void deleteSource()}
            >
              {remove.isPending ? 'Deleting…' : 'Confirm delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
