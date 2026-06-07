/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const invokeMock = vi.fn().mockResolvedValue({ data: { updated: 3, dry_run: true }, error: null });
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import BackfillsTab from '../BackfillsTab';
import { GLOBAL_BACKFILL_JOBS } from '@/config/backfillJobs';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('GLOBAL_BACKFILL_JOBS', () => {
  it('every job supports dry_run in its body', () => {
    for (const job of GLOBAL_BACKFILL_JOBS) {
      expect(job.buildBody({ dryRun: true })).toMatchObject({ dry_run: true });
      expect(job.buildBody({ dryRun: false })).toMatchObject({ dry_run: false });
    }
  });
});

describe('BackfillsTab', () => {
  beforeEach(() => invokeMock.mockClear());

  it('renders a card per global job', () => {
    wrap(<BackfillsTab />);
    for (const job of GLOBAL_BACKFILL_JOBS) {
      expect(screen.getByText(job.label)).toBeInTheDocument();
    }
  });

  it('runs a batch dry-run by default', async () => {
    wrap(<BackfillsTab />);
    fireEvent.click(screen.getAllByText('Run batch')[0]);
    await waitFor(() => {
      const [fn, opts] = invokeMock.mock.calls[0];
      expect(fn).toBe(GLOBAL_BACKFILL_JOBS[0].fn);
      expect((opts as { body: { dry_run: boolean } }).body.dry_run).toBe(true);
    });
  });
});
