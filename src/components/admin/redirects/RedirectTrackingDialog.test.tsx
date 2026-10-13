import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { RedirectTrackingDialog } from './RedirectTrackingDialog';
import type { InventoryRedirect } from '@/lib/redirects/inventory';

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      order() {
        return query;
      },
      range() {
        return query;
      },
      gte() {
        return query;
      },
      abortSignal: async () => ({
        data: null,
        count: null,
        error: { message: 'permission denied' },
      }),
    };
    return query;
  },
}));
const row: InventoryRedirect = {
  id: 'fixture',
  manualId: 'fixture',
  source: '/go/campaign',
  target: '/events',
  origin: 'redirects',
  kind: 'Manual',
  state: 'Enabled',
  statusCode: 302,
  updatedAt: null,
  clicks: 12,
};
describe('visit report', () => {
  it('shows cached visit totals and referrer hosts while keeping private query strings out of the report', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(
      ['redirect-visit-report', 'fixture', '30'],
      [
        {
          id: 1,
          ts: '2026-10-13T12:00:00Z',
          country: 'CH',
          referer: 'https://example.com/?email=private',
          status: 302,
        },
      ],
    );
    render(
      <QueryClientProvider client={client}>
        <RedirectTrackingDialog row={row} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('12 lifetime visits')).toBeVisible();
    expect(screen.getByText(/1 visit in this range/)).toBeVisible();
    expect(screen.getAllByText('example.com')).toHaveLength(2);
    expect(screen.queryByText(/email=private/)).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Tracking date range' })).toHaveValue('30');
  });
  it('shows failed analytics reads with a retry instead of claiming zero visits', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RedirectTrackingDialog row={row} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied');
    expect(screen.getByRole('button', { name: 'Retry report' })).toBeVisible();
    expect(screen.queryByText('No recorded visits in this range.')).toBeNull();
  });
});
