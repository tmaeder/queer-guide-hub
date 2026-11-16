import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { DataSource } from '@/lib/adminDataSources';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  toggle: vi.fn(),
  run: vi.fn(),
  save: vi.fn(),
  roles: { isAdmin: true, loading: false },
}));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => mocks.roles }));
vi.mock('@/lib/adminDataSources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/adminDataSources')>()),
  fetchDataSources: mocks.fetch,
  setSourceEnabled: mocks.toggle,
  runDataSource: mocks.run,
  saveSource: mocks.save,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminDataSources from '../AdminDataSources';

function source(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: 'shared-id',
    registry: 'scrape_sources',
    name: 'City scraper',
    identifier: 'city-guide',
    type: 'html',
    url: 'https://example.com/cities',
    target: 'venues',
    enabled: true,
    schedule: null,
    intervalHours: 24,
    lastRun: null,
    lastSuccess: null,
    lastError: null,
    failures: 0,
    fetched: 12,
    autoPaused: false,
    pauseReason: null,
    edgeFunction: null,
    category: null,
    fetchFrequency: null,
    ...overrides,
  };
}
const allSources = [
  source(),
  source({
    registry: 'ingestion_sources',
    name: 'Places API',
    identifier: 'places-api',
    type: 'api',
    url: null,
    edgeFunction: 'source-places',
  }),
  source({
    registry: 'news_sources',
    name: 'News feed',
    identifier: 'news',
    type: 'news / rss',
    target: 'news_articles',
    url: 'https://news.example.org/rss',
    fetchFrequency: 120,
    autoPaused: true,
    lastError: 'Feed timed out',
  }),
];

function renderPage(path = '/admin/data-sources') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <AdminDataSources />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roles.isAdmin = true;
  mocks.roles.loading = false;
  mocks.fetch.mockReset().mockResolvedValue(allSources);
  mocks.toggle.mockReset().mockResolvedValue(undefined);
  mocks.run.mockReset().mockResolvedValue(undefined);
  mocks.save.mockReset().mockResolvedValue(undefined);
});

describe('AdminDataSources', () => {
  it('lists all source families, their health, and supported controls', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'All data sources' });
    await within(table).findByText('Places API');
    expect(within(table).getByText('City scraper')).toBeInTheDocument();
    expect(within(table).getByText('News feed')).toBeInTheDocument();
    expect(within(table).getByText('Auto-paused')).toBeInTheDocument();
    expect(within(table).getByText('Feed timed out')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Run .* now$/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Advanced source tools' })).toHaveAttribute(
      'href',
      '/admin/pipelines?tab=sources',
    );
  });

  it('filters by URL and registry and supports the legacy news source destination', async () => {
    renderPage('/admin/data-sources?registry=news_sources');
    await screen.findByText('News feed');
    expect(screen.queryByRole('button', { name: 'Manage City scraper' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Registry' }), {
      target: { value: 'all' },
    });
    expect(screen.getByRole('button', { name: 'Manage City scraper' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sources' }), {
      target: { value: 'news.example.org' },
    });
    expect(screen.getByRole('button', { name: 'Manage News feed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage Places API' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Health' }), {
      target: { value: 'healthy' },
    });
    expect(screen.queryByRole('button', { name: 'Manage News feed' })).not.toBeInTheDocument();
  });

  it('routes status changes and runs to the correct source even with shared IDs', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable News feed (News & feeds)' }));
    await waitFor(() => expect(mocks.toggle).toHaveBeenCalledWith(allSources[2], false));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Run Places API now' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run Places API now' }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalledWith(allSources[1]));
  });

  it('shows source details, saves edits and refreshes the combined list', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Manage News feed' }));
    const dialog = screen.getByRole('dialog', { name: 'Manage News feed' });
    expect(
      within(dialog).getByText('Enabling this registration does not clear its health pause.', {
        exact: false,
      }),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Updated feed' } });
    fireEvent.change(within(dialog).getByLabelText('Fetch frequency (minutes)'), {
      target: { value: '60' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        allSources[2],
        expect.objectContaining({ name: 'Updated feed', fetchFrequency: '60' }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.fetch.mock.calls.length).toBeGreaterThan(1);
  });

  it('keeps the editor open and preserves input if saving fails', async () => {
    mocks.save.mockRejectedValue(new Error('Permission denied'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Manage City scraper' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My edits' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.getByLabelText('Name')).toHaveValue('My edits');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows failed registry reads with retry instead of an empty source list', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('News & feeds: Connection failed'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load all data sources');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Manage News feed' })).toBeInTheDocument();
  });

  it('paginates the combined list and resets to the first page when filtering', async () => {
    mocks.fetch.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) =>
        source({ id: String(index), name: `Source ${index}` }),
      ),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Manage Source 50' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage Source 0' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Source 0' } });
    expect(screen.getByRole('button', { name: 'Manage Source 0' })).toBeInTheDocument();
  });

  it.each([false, true])(
    'does not query or expose source controls before admin authorization (loading=%s)',
    async (loading) => {
      mocks.roles.isAdmin = false;
      mocks.roles.loading = loading;
      renderPage();
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      if (!loading)
        expect(screen.getByRole('alert')).toHaveTextContent('Administrator access required');
    },
  );
});
