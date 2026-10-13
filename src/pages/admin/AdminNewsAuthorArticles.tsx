import { Link, useSearchParams } from 'react-router';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminSimpleTable } from '@/components/admin/primitives/AdminSimpleTable';
import { Button } from '@/components/ui/button';
import { AUTHOR_PAGE_SIZE, useNewsAuthorArticles } from '@/hooks/useNewsAuthorsAdmin';

export default function AdminNewsAuthorArticles() {
  const [params, setParams] = useSearchParams();
  const author = params.get('author');
  const requestedPage = Number(params.get('page') ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0 &&
    requestedPage <= Math.floor(2147483647 / AUTHOR_PAGE_SIZE)
      ? requestedPage - 1
      : 0;
  const validAuthor = author !== null && author.trim() !== '';
  const articles = useNewsAuthorArticles(validAuthor ? author : null, page);
  const changePage = (next: number) => {
    setParams((old) => {
      const result = new URLSearchParams(old);
      if (next === 0) result.delete('page');
      else result.set('page', String(next + 1));
      return result;
    });
  };
  const total = articles.data?.total ?? 0;
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={validAuthor ? `Articles by ${author}` : 'Author articles'}
        subtitle={
          validAuthor
            ? 'All articles with this byline, including unpublished, archived and merged records.'
            : undefined
        }
        backTo={{ label: 'News Authors', route: '/admin/news-authors' }}
      />
      {!validAuthor ? (
        <p>
          Choose an author from{' '}
          <Link className="underline underline-offset-4" to="/admin/news-authors">
            News Authors
          </Link>
          .
        </p>
      ) : articles.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-4">
          <p>Could not load this author’s articles.</p>
          <Button variant="outline" onClick={() => void articles.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <p className="text-13 tabular-nums" aria-live="polite">
            {articles.isLoading
              ? 'Loading articles…'
              : `${total.toLocaleString()} ${total === 1 ? 'article' : 'articles'}`}
          </p>
          <AdminSimpleTable
            caption={`Articles by ${author}`}
            emptyNoun="articles"
            emptyDescription="No articles currently have this exact author byline."
            isLoading={articles.isLoading}
            rows={articles.data?.rows ?? []}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'title',
                header: 'Article',
                render: (row) => (
                  <Link
                    className="underline underline-offset-4 break-words"
                    to={`/admin/content/news_articles?edit=${encodeURIComponent(row.id)}`}
                  >
                    {row.title}
                  </Link>
                ),
              },
              { key: 'publisher', header: 'Medium', render: (row) => row.publisher_name || '—' },
              {
                key: 'published',
                header: 'Published',
                render: (row) =>
                  row.published_at
                    ? new Date(row.published_at).toLocaleDateString()
                    : 'Unpublished',
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) =>
                  row.duplicate_of_id
                    ? 'Merged'
                    : row.archived_at
                      ? 'Archived'
                      : row.quality_status || 'Unreviewed',
              },
            ]}
          />
          <nav
            aria-label="Article pagination"
            className="flex flex-wrap items-center justify-end gap-4"
          >
            <Button
              variant="outline"
              disabled={articles.isFetching || page === 0}
              onClick={() => changePage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-13 tabular-nums">Page {page + 1}</span>
            <Button
              variant="outline"
              disabled={articles.isFetching || (page + 1) * AUTHOR_PAGE_SIZE >= total}
              onClick={() => changePage(page + 1)}
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
