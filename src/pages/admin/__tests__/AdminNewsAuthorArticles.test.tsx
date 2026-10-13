import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
const mocks = vi.hoisted(() => ({ query: vi.fn(), refetch: vi.fn(), error: false, total: 58 }));
vi.mock('@/hooks/useNewsAuthorsAdmin', () => ({
  AUTHOR_PAGE_SIZE: 50,
  useNewsAuthorsAdmin: () => ({
    data: [{ author: 'Alex & Léa', article_count: 58 }],
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
  useChangeNewsAuthor: () => ({ isPending: false }),
  useNewsAuthorArticles: (author: string | null, page: number) => {
    mocks.query(author, page);
    return {
      data: {
        rows: [
          {
            id: 'article-1',
            title: 'An unpublished article',
            published_at: null,
            quality_status: 'pending',
            publisher_name: 'Paper',
            archived_at: null,
            duplicate_of_id: null,
          },
        ],
        total: mocks.total,
      },
      isLoading: false,
      isFetching: false,
      isError: mocks.error,
      refetch: mocks.refetch,
    };
  },
}));
import AdminNewsAuthorArticles from '../AdminNewsAuthorArticles';
import AdminNewsAuthors from '../AdminNewsAuthors';
const mount = (url = '/admin/news-authors/articles?author=Alex+%26+L%C3%A9a') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/admin/news-authors" element={<AdminNewsAuthors />} />
        <Route path="/admin/news-authors/articles" element={<AdminNewsAuthorArticles />} />
      </Routes>
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.error = false;
  mocks.total = 58;
});
describe('Dedicated author article page', () => {
  it('navigates from Articles and renders the list as a separate page', () => {
    mount('/admin/news-authors');
    fireEvent.click(screen.getByRole('link', { name: 'Articles by Alex & Léa' }));
    expect(screen.getByRole('heading', { name: 'Articles by Alex & Léa' })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Articles by Alex & Léa' })).toBeVisible();
    expect(mocks.query).toHaveBeenLastCalledWith('Alex & Léa', 0);
    expect(screen.getByText('Unpublished')).toBeVisible();
    expect(screen.getByRole('link', { name: 'An unpublished article' })).toHaveAttribute(
      'href',
      '/admin/content/news_articles?edit=article-1',
    );
  });
  it('persists pagination in the URL and supports direct deep links', () => {
    mount('/admin/news-authors/articles?author=Alex+%26+L%C3%A9a&page=2');
    expect(mocks.query).toHaveBeenLastCalledWith('Alex & Léa', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(mocks.query).toHaveBeenLastCalledWith('Alex & Léa', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mocks.query).toHaveBeenLastCalledWith('Alex & Léa', 1);
  });
  it('does not query all articles when the author parameter is missing', () => {
    mount('/admin/news-authors/articles');
    expect(mocks.query).toHaveBeenLastCalledWith(null, 0);
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('shows failed reads with retry', () => {
    mocks.error = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalled();
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('handles an invalid page parameter without invalid database offsets', () => {
    mount('/admin/news-authors/articles?author=Alex&page=999999999999');
    expect(mocks.query).toHaveBeenLastCalledWith('Alex', 0);
  });
});
