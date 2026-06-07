/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const invokeMock = vi.fn().mockResolvedValue({ data: { checked: 2 }, error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import { DataTableBackfillActions } from '../DataTableBackfillActions';
import { backfillJobsFor } from '@/config/backfillJobs';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('backfillJobsFor', () => {
  it('returns the events liveness job, empty for unknown tables', () => {
    const jobs = backfillJobsFor('events');
    expect(jobs.map((j) => j.key)).toContain('liveness');
    expect(jobs[0].buildBody(['e1', 'e2'])).toEqual({ event_ids: ['e1', 'e2'], dry_run: false });
    expect(backfillJobsFor('venues')).toEqual([]);
  });
});

describe('DataTableBackfillActions', () => {
  beforeEach(() => invokeMock.mockClear());

  it('invokes the edge function with the selected ids', async () => {
    wrap(
      <DataTableBackfillActions
        jobs={backfillJobsFor('events')}
        selectedIds={new Set(['e1', 'e2'])}
      />,
    );
    fireEvent.click(screen.getByText('Re-check liveness'));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('event-liveness-checker', {
        body: { event_ids: ['e1', 'e2'], dry_run: false },
      }),
    );
  });

  it('renders nothing when there are no jobs', () => {
    const { container } = wrap(
      <DataTableBackfillActions jobs={[]} selectedIds={new Set()} />,
    );
    expect(container.textContent).toBe('');
  });
});
