import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
const mocks = vi.hoisted(() => ({
  rows: [{ author: 'Alex', article_count: 3 }],
  articleRows: [
    { id: 'article-1', title: 'An article', publisher_name: 'Paper', quality_status: 'passed' },
  ],
  mutate: vi.fn(),
  retry: vi.fn(),
  authorQuery: vi.fn(),
  articleQuery: vi.fn(),
  error: false,
  pending: false,
}));
vi.mock('@/hooks/useNewsAuthorsAdmin', () => ({
  AUTHOR_PAGE_SIZE: 50,
  useNewsAuthorsAdmin: (search: string, page: number, enabled = true) => {
    if (enabled) mocks.authorQuery(search, page);
    return {
      data: mocks.rows,
      isLoading: false,
      isFetching: false,
      isError: mocks.error,
      refetch: mocks.retry,
    };
  },
  useNewsAuthorArticles: (author: string | null, page: number) => {
    mocks.articleQuery(author, page);
    return { data: mocks.articleRows, isLoading: false, isFetching: false, isError: false };
  },
  useChangeNewsAuthor: () => ({ mutateAsync: mocks.mutate, isPending: mocks.pending }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const exportMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/newsAuthorsExport', () => ({ exportNewsAuthors: exportMock }));
import AdminNewsAuthors from '../AdminNewsAuthors';
const view = () =>
  render(
    <MemoryRouter>
      <AdminNewsAuthors />
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [{ author: 'Alex', article_count: 3 }];
  mocks.error = false;
  mocks.pending = false;
  mocks.mutate.mockResolvedValue(3);
});
describe('News author management', () => {
  it('searches and links to the dedicated author article page', () => {
    view();
    fireEvent.change(screen.getByLabelText('Search authors'), { target: { value: 'Alex' } });
    expect(mocks.authorQuery).toHaveBeenLastCalledWith('Alex', 0);
    expect(screen.getByRole('link', { name: 'Articles by Alex' })).toHaveAttribute(
      'href',
      '/admin/news-authors/articles?author=Alex',
    );
    expect(screen.getByRole('link', { name: '3 articles by Alex' })).toHaveAttribute(
      'href',
      '/admin/news-authors/articles?author=Alex',
    );
    expect(screen.queryByRole('link', { name: 'An article' })).toBeNull();
  });
  it('confirms rename using the source count and resets the list', async () => {
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Alex' }));
    expect(screen.getByRole('button', { name: 'Confirm rename' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('New author name'), { target: { value: 'Alex Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rename' }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        source: 'Alex',
        target: 'Alex Smith',
        merge: false,
        count: 3,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('keeps a rejected merge open with the database error', async () => {
    mocks.mutate.mockRejectedValue({ message: 'Choose an existing author to merge into.' });
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Merge Alex' }));
    fireEvent.change(screen.getByLabelText('Merge into author'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm merge' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Choose an existing author'),
    );
    expect(mocks.mutate).toHaveBeenCalledWith({
      source: 'Alex',
      target: 'Sam',
      merge: true,
      count: 3,
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('paginates authors and resets pagination when searching', () => {
    mocks.rows = Array.from({ length: 51 }, (_, index) => ({
      author: `Author ${index}`,
      article_count: 1,
    }));
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mocks.authorQuery).toHaveBeenLastCalledWith('', 1);
    fireEvent.change(screen.getByLabelText('Search authors'), { target: { value: 'Author' } });
    expect(mocks.authorQuery).toHaveBeenLastCalledWith('Author', 0);
    expect(screen.queryByText('Author 50')).not.toBeInTheDocument();
  });
  it('shows retry rather than an empty table when fetching fails', () => {
    mocks.error = true;
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.retry).toHaveBeenCalled();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('prevents resubmission while a mutation is pending', () => {
    mocks.pending = true;
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Merge Alex' }));
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
    expect(screen.getByLabelText('Merge into author')).toBeDisabled();
  });
  it('exports the searched author list as Excel and CSV', async () => {
    view();
    fireEvent.change(screen.getByLabelText('Search authors'), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
    await waitFor(() => expect(exportMock).toHaveBeenLastCalledWith('Alex', 'Excel'));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(exportMock).toHaveBeenLastCalledWith('Alex', 'CSV'));
  });
});
