/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import DataOperationsTab from '../DataOperationsTab';

const { rpc, response } = vi.hoisted(() => {
  const response = vi.fn();
  return { response, rpc: vi.fn(() => ({ returns: () => ({ abortSignal: response }) })) };
});

vi.mock('@/integrations/supabase/untyped', () => ({ untypedSupabase: { rpc } }));

const time = '2026-11-07T10:00:00Z';
const entries = [
  ...Array.from({ length: 28 }, (_, index) => ({
    kind: 'feed',
    id: String(index),
    name: `Feed ${String(index).padStart(2, '0')}`,
    identifier: null,
    target: 'news',
    cadence: '120 min interval',
    activity_at: time,
    success_at: time,
    state: 'active',
    note: null,
  })),
  {
    kind: 'automation',
    id: '1',
    name: 'Event sweep',
    identifier: 'event_sweep',
    target: 'cron',
    cadence: '0 * * * *',
    activity_at: time,
    success_at: null,
    state: 'attention',
    note: 'Last run failed',
  },
];

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DataOperationsTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Data operations inventory', () => {
  beforeEach(() => {
    response.mockReset();
    response.mockResolvedValue({ data: { observed_at: time, entries }, error: null });
  });

  it('prioritizes problems, and searches and filters across all pages', async () => {
    renderOverview();
    const table = screen.getByRole('table', { name: 'Sources and automations inventory' });
    const action = await within(table).findByRole('link', { name: 'Manage Event sweep' });
    expect(action).toHaveTextContent(/^Manage$/);
    expect(action).toHaveAttribute('href', '/admin/automation?automation=event_sweep');
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Last run failed');
    expect(rpc).toHaveBeenCalledWith('admin_data_operations_overview');
    expect(screen.getByText('1–25 of 29 entries')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('26–29 of 29 entries')).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'event_sweep' } });
    expect(screen.getByText('1 entry')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Registry' }), {
      target: { value: 'sources' },
    });
    expect(screen.getByText('0 entries')).toBeVisible();
    expect(within(table).queryByText('Event sweep')).toBeNull();
  });

  it('distinguishes a failed snapshot from an empty inventory and can retry', async () => {
    response.mockResolvedValueOnce({ data: null, error: new Error('unavailable') });
    renderOverview();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
    expect(screen.queryByText('0 entries')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }));
    expect(await screen.findByText('Event sweep')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
