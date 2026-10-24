import { useState } from 'react';
import { Link } from 'react-router';
import { authorArticlesPath } from '@/lib/adminAuthorArticles';
import { toast } from 'sonner';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import { exportNewsAuthors } from '@/lib/newsAuthorsExport';
import { AdminSimpleTable } from '@/components/admin/primitives/AdminSimpleTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AUTHOR_PAGE_SIZE,
  useNewsAuthorsAdmin,
  useChangeNewsAuthor,
  type NewsAuthorRow,
} from '@/hooks/useNewsAuthorsAdmin';

function Pager({
  page,
  more,
  busy,
  onChange,
}: {
  page: number;
  more: boolean;
  busy: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-4 py-4">
      <Button variant="outline" disabled={busy || page === 0} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="text-sm tabular-nums">Page {page + 1}</span>
      <Button variant="outline" disabled={busy || !more} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
function QueryError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-4 py-4">
      <p>Could not load the records.</p>
      <Button variant="outline" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

export default function AdminNewsAuthors() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ row: NewsAuthorRow; merge: boolean } | null>(null);
  const [target, setTarget] = useState('');
  const [failure, setFailure] = useState('');
  const authors = useNewsAuthorsAdmin(search, page);
  const change = useChangeNewsAuthor();
  const suggestions = useNewsAuthorsAdmin(target, 0, editing?.merge === true);
  const rows = authors.data ?? [];
  const beginChange = (row: NewsAuthorRow, merge: boolean) => {
    setEditing({ row, merge });
    setTarget(merge ? '' : row.author);
    setFailure('');
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || change.isPending) return;
    setFailure('');
    try {
      const count = await change.mutateAsync({
        source: editing.row.author,
        target: target.trim(),
        merge: editing.merge,
        count: editing.row.article_count,
      });
      toast.success(`${count} articles updated`);
      setEditing(null);
      setPage(0);
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : ((error as { message?: string })?.message ??
              'Could not update this author. Try again.'),
      );
    }
  };
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="News Authors"
        subtitle="Manage article bylines. Counts include archived and duplicate articles."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportExcelButton onExport={() => exportNewsAuthors(search, 'Excel')} />
            <ExportExcelButton format="CSV" onExport={() => exportNewsAuthors(search, 'CSV')} />
            <Button variant="outline" asChild>
              <Link to="/admin/content/news_articles">News Articles</Link>
            </Button>
          </div>
        }
      />
      <div className="max-w-md space-y-2">
        <Label htmlFor="author-search">Search authors</Label>
        <Input
          id="author-search"
          value={search}
          placeholder="Search by name"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
      </div>
      {authors.isError ? (
        <QueryError
          retry={() => {
            void authors.refetch();
          }}
        />
      ) : (
        <>
          <AdminSimpleTable
            caption="News authors"
            emptyNoun="authors"
            emptyDescription="Authors appear when a news article has a byline."
            filtered={!!search}
            onResetFilters={() => {
              setSearch('');
              setPage(0);
            }}
            isLoading={authors.isLoading}
            rows={rows.slice(0, AUTHOR_PAGE_SIZE)}
            rowKey={(row) => row.author}
            columns={[
              {
                key: 'author',
                header: 'Author',
                render: (row) => <span className="break-words font-medium">{row.author}</span>,
              },
              {
                key: 'count',
                header: 'Articles',
                align: 'right',
                render: (row) => (
                  <Link
                    className="tabular-nums underline underline-offset-4"
                    aria-label={`${row.article_count} articles by ${row.author}`}
                    to={authorArticlesPath(row.author)}
                  >
                    {row.article_count.toLocaleString()}
                  </Link>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        aria-label={`Articles by ${row.author}`}
                        to={authorArticlesPath(row.author)}
                      >
                        Articles
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Rename ${row.author}`}
                      onClick={() => beginChange(row, false)}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Merge ${row.author}`}
                      onClick={() => beginChange(row, true)}
                    >
                      Merge
                    </Button>
                  </div>
                ),
              },
            ]}
          />
          <Pager
            page={page}
            more={rows.length > AUTHOR_PAGE_SIZE}
            busy={authors.isFetching}
            onChange={setPage}
          />
        </>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !change.isPending) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.merge ? 'Merge author' : 'Rename author'}</DialogTitle>
            <DialogDescription>
              {editing && (
                <>
                  Update all {editing.row.article_count.toLocaleString()} articles attributed to “
                  {editing.row.author}”.{' '}
                  {editing.merge
                    ? 'Enter the exact name of an existing author.'
                    : 'Use Merge if the new name already exists.'}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="author-target">
                {editing?.merge ? 'Merge into author' : 'New author name'}
              </Label>
              <Input
                id="author-target"
                list={editing?.merge ? 'merge-authors' : undefined}
                required
                maxLength={255}
                value={target}
                disabled={change.isPending}
                onChange={(event) => setTarget(event.target.value)}
              />
            </div>
            {editing?.merge && (
              <datalist id="merge-authors">
                {(suggestions.data ?? [])
                  .filter((row) => row.author !== editing.row.author)
                  .map((row) => (
                    <option key={row.author} value={row.author} />
                  ))}
              </datalist>
            )}
            {failure && (
              <p role="alert" className="text-sm text-destructive">
                {failure}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={change.isPending}
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  change.isPending || !target.trim() || target.trim() === editing?.row.author
                }
              >
                {change.isPending
                  ? 'Updating…'
                  : editing?.merge
                    ? 'Confirm merge'
                    : 'Confirm rename'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
