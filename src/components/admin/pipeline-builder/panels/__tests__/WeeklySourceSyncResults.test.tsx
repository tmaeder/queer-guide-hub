/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

const { fromMock, rangeMock, eqMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rangeMock: vi.fn(),
  eqMock: vi.fn(),
}));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedFrom: fromMock }));
vi.mock('@/lib/adminDataSources', () => ({
  SOURCE_REGISTRIES: {
    scrape_sources: 'Scrapers',
    ingestion_sources: 'API & imports',
    news_sources: 'News & feeds',
  },
}));
import WeeklySourceSyncResults from '../WeeklySourceSyncResults';

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WeeklySourceSyncResults runId="run-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const builder = { select: vi.fn(), eq: eqMock, order: vi.fn(), range: rangeMock };
  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  eqMock.mockReturnValue(builder);
  rangeMock.mockImplementation((start: number) =>
    Promise.resolve({
      error: null,
      count: 52,
      data: [
        {
          id: `source-${start}`,
          registry: 'ingestion_sources',
          source_name: start ? 'Second-page source' : 'Provider',
          status: 'blocked',
          attempts: 1,
          interrupted_attempts: 0,
          items_fetched: 0,
          items_staged: 0,
          reason: 'Missing required setting',
          required_settings: ['PROVIDER_API_KEY'],
        },
      ],
    }),
  );
  const run = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
  run.select.mockReturnValue(run);
  run.eq.mockReturnValue(run);
  run.single.mockResolvedValue({
    error: null,
    data: {
      status: 'failed',
      context: {
        weekly_summary: {
          sources: 52,
          processed: 52,
          succeeded: 51,
          skipped: 0,
          blocked: 1,
          failed: 0,
          records_staged: 17,
        },
      },
    },
  });
  fromMock.mockImplementation((table) => (table === 'pipeline_runs' ? run : builder));
});

describe('weekly source results', () => {
  it('shows individual blocked settings and real run totals', async () => {
    show();
    expect(await screen.findByText('Provider')).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Per-source weekly sync outcomes' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Needs: PROVIDER_API_KEY/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('52 of 52 sources processed');
    expect(screen.getByRole('status')).toHaveTextContent('17 records reported as staged');
  });

  it('paginates all registered sources and resets the page when filtering', async () => {
    show();
    await screen.findByText('Provider');
    fireEvent.click(screen.getByRole('button', { name: 'Next sources' }));
    expect(await screen.findByText('Second-page source')).toBeInTheDocument();
    expect(rangeMock).toHaveBeenLastCalledWith(50, 99);
    fireEvent.change(screen.getByLabelText('Source status'), { target: { value: 'failed' } });
    await waitFor(() => expect(eqMock).toHaveBeenCalledWith('status', 'failed'));
    expect(rangeMock).toHaveBeenLastCalledWith(0, 49);
  });

  it('reports authorization/load errors without presenting an empty successful run', async () => {
    rangeMock.mockResolvedValueOnce({ data: null, count: null, error: { message: 'denied' } });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access is required');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
