import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { SourceRecord } from '@/hooks/useNewsSourcesAdmin';
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  articles: vi.fn(),
  save: vi.fn(),
  resume: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  retry: vi.fn(),
  rows: [] as unknown[],
  total: 0,
  error: false,
  pending: false,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const exportMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/newsSourcesExport', () => ({ exportNewsSources: exportMock }));
vi.mock('@/hooks/useNewsSourcesAdmin', async (load) => {
  const original = await load<Record<string, unknown>>();
  return {
    ...original,
    useNewsSourcesAdmin: (filters: unknown, enabled = true) => {
      if (enabled) mocks.query(filters);
      return {
        data: { rows: mocks.rows, total: mocks.total },
        isLoading: false,
        isFetching: false,
        isError: mocks.error,
        refetch: mocks.retry,
      };
    },
    useSourceArticles: (id: string | null, page: number) => {
      mocks.articles(id, page);
      return {
        data: {
          rows: [
            {
              id: 'article-1',
              title: 'An imported article',
              published_at: null,
              quality_status: 'passed',
            },
          ],
          total: 1,
        },
        isLoading: false,
        isFetching: false,
        isError: false,
      };
    },
    useSourcePublishers: () => ({
      data: [{ id: 'pub-1', name: 'Publisher One', status: 'active', domain_match: true }],
      isError: false,
    }),
    useSaveNewsSource: () => ({ mutateAsync: mocks.save, isPending: mocks.pending }),
    useDeleteNewsSource: () => ({ mutateAsync: mocks.remove, isPending: false }),
    useResumeNewsSource: () => ({ mutateAsync: mocks.resume, isPending: false }),
    useCreateSourcePublisher: () => ({ mutateAsync: mocks.create, isPending: false }),
  };
});
import { NewsSourcesWorkspace } from './NewsSourcesWorkspace';
const source = {
  id: 'source-1',
  name: 'Feed One',
  url: 'https://example.com/rss',
  category: 'general',
  source_type: 'rss',
  feed_type: 'news',
  fetch_frequency: 120,
  is_active: true,
  auto_publish: false,
  keywords: ['queer'],
  organization_id: 'pub-1',
  publisher_name: 'Publisher One',
  publisher_status: 'active',
  article_count: 4,
  updated_at: '2026-10-13T10:00:00Z',
  last_fetched_at: null,
  last_successful_fetch: null,
  last_error: null,
  auto_paused: false,
  consecutive_failures: 0,
  backoff_until: null,
} as SourceRecord;
function mount(props: Parameters<typeof NewsSourcesWorkspace>[0] = {}) {
  return render(
    <MemoryRouter>
      <NewsSourcesWorkspace {...props} />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [source];
  mocks.total = 104;
  mocks.error = false;
  mocks.pending = false;
  mocks.save.mockResolvedValue(source);
  mocks.create.mockResolvedValue({ id: 'new-pub', name: 'Draft Publisher' });
});
describe('News source workspace', () => {
  it('searches, filters unlinked/inactive feeds and paginates on the server', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mocks.query).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } });
    fireEvent.click(screen.getByLabelText('Unlinked publishers'));
    fireEvent.change(screen.getByLabelText('Search sources'), { target: { value: 'Pink' } });
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 0, state: 'inactive', unlinked: true, search: 'Pink' }),
    );
  });
  it('links to the canonical publisher and opens imported articles in CMS', () => {
    mount();
    expect(screen.getByRole('link', { name: 'Publisher One' })).toHaveAttribute(
      'href',
      '/admin/content/organizations?edit=pub-1',
    );
    fireEvent.click(screen.getByRole('button', { name: /articles from Feed One/ }));
    expect(mocks.articles).toHaveBeenLastCalledWith('source-1', 0);
    expect(screen.getByRole('link', { name: 'An imported article' })).toHaveAttribute(
      'href',
      '/admin/content/news_articles?edit=article-1',
    );
  });
  it('keeps a legacy cadence when saving unrelated feed edits', async () => {
    mocks.rows = [{ ...source, fetch_frequency: 1 }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Feed One' }));
    const frequency = screen.getByLabelText('Fetch frequency (minutes)');
    expect(frequency).toHaveAttribute('min', '1');
    fireEvent.change(screen.getByLabelText('Feed name'), { target: { value: 'Renamed feed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save source' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.save.mock.calls[0][0].form.fetch_frequency).toBe(1);
  });
  it('requires the normal limits when deliberately changing a legacy cadence', () => {
    mocks.rows = [{ ...source, fetch_frequency: 1 }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Feed One' }));
    const frequency = screen.getByLabelText('Fetch frequency (minutes)');
    fireEvent.change(frequency, { target: { value: '2' } });
    expect(frequency).toHaveAttribute('min', '30');
  });
  it('saves feed configuration separately from publisher identity and diagnostics', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Feed One' }));
    fireEvent.change(screen.getByLabelText('Feed name'), { target: { value: 'Feed renamed' } });
    fireEvent.change(screen.getByLabelText('Publisher', { exact: true }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save source' }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        source,
        form: expect.objectContaining({
          name: 'Feed renamed',
          organization_id: null,
          keywords: ['queer'],
        }),
      }),
    );
    const payload = mocks.save.mock.calls[0][0].form;
    expect(payload).not.toHaveProperty('last_error');
    expect(payload).not.toHaveProperty('publisher_name');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('never assigns a domain suggestion automatically', () => {
    mocks.rows = [{ ...source, organization_id: null, publisher_name: null }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Feed One' }));
    expect(screen.getByLabelText('Publisher', { exact: true })).toHaveValue('');
    expect(screen.getByText(/Domain matches are suggestions/)).toBeVisible();
  });
  it('creates a draft publisher only on an explicit action and attaches it on save', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    fireEvent.click(screen.getByText('Create a draft Publisher'));
    fireEvent.change(screen.getByLabelText('Organisation name'), {
      target: { value: 'Draft Publisher' },
    });
    fireEvent.change(screen.getByLabelText('Organisation website'), {
      target: { value: 'https://publisher.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Publisher' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Publisher', { exact: true })).toHaveValue('new-pub'),
    );
    expect(mocks.create).toHaveBeenCalledWith({
      name: 'Draft Publisher',
      website: 'https://publisher.example',
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('keeps rejected stale edits open with an actionable error', async () => {
    mocks.save.mockRejectedValue({ message: 'Source changed. Close and refresh.' });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Feed One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save source' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Source changed'));
    expect(screen.getByRole('dialog')).toBeVisible();
  });
  it('locks pending writes and controls in a dirty Organisation editor', () => {
    mount({ organizationId: 'pub-1', organizationName: 'Publisher One', disabled: true });
    expect(screen.getByRole('button', { name: 'Add source' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Feed One' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Link existing source' })).toBeDisabled();
  });
  it('keeps publisher identity read-only for moderators while allowing feed editing', () => {
    mount({ canManagePublishers: false });
    expect(screen.queryByRole('link', { name: 'Organisations' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Feed One' }));
    expect(screen.getByLabelText('Feed URL')).not.toBeDisabled();
    expect(screen.queryByLabelText('Publisher', { exact: true })).toBeNull();
    expect(screen.getByText(/Publisher relationships are managed/)).toBeVisible();
    expect(screen.queryByText('Create a draft Publisher')).toBeNull();
  });
  it('requires confirmation to resume an automatically paused source', async () => {
    mocks.rows = [{ ...source, auto_paused: true, auto_paused_reason: 'HTTP 500' }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Resume Feed One' }));
    expect(mocks.resume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm resume' }));
    await waitFor(() => expect(mocks.resume).toHaveBeenCalled());
  });
  it('reviews moving an existing feed to the Organisation in context', () => {
    mount({ organizationId: 'pub-2', organizationName: 'Publisher Two' });
    fireEvent.click(screen.getByRole('button', { name: 'Link existing source' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Review link' }),
    );
    expect(screen.getByLabelText('Publisher', { exact: true })).toHaveValue('pub-2');
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('requires the exact name and previews the article cascade before deleting', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Feed One' }));
    expect(screen.getByText(/all 4 of its imported articles/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type the feed name to confirm'), {
      target: { value: 'Feed One' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(source));
  });
  it('shows read errors rather than a misleading empty table and offers retry', () => {
    mocks.error = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.retry).toHaveBeenCalled();
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('exports the filtered list as Excel and CSV', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'error' } });
    fireEvent.change(screen.getByLabelText('Search sources'), { target: { value: 'Pink' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
    await waitFor(() =>
      expect(exportMock).toHaveBeenLastCalledWith(
        { search: 'Pink', state: 'error', unlinked: false, organizationId: undefined },
        'Excel',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() =>
      expect(exportMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Pink', state: 'error' }),
        'CSV',
      ),
    );
  });
  it('scopes the export to the publisher when embedded on an Organisation', async () => {
    mount({ organizationId: 'pub-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() =>
      expect(exportMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ organizationId: 'pub-1' }),
        'CSV',
      ),
    );
  });
});
