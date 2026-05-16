/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { fetchAlertsMock } = vi.hoisted(() => ({ fetchAlertsMock: vi.fn() }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));
vi.mock('@/hooks/usePipelineBuilderTabs', () => ({
  fetchDataOpsAlerts: fetchAlertsMock,
  ackDataOpsAlert: vi.fn().mockResolvedValue(undefined),
}));

import AlertsTab from '../AlertsTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('AlertsTab', () => {
  it('shows All clear when no alerts', async () => {
    fetchAlertsMock.mockResolvedValue([]);
    render(<AlertsTab />, { wrapper });
    await waitFor(() => expect(screen.getByText(/All clear/)).toBeInTheDocument());
  });

  it('renders alert rows', async () => {
    fetchAlertsMock.mockResolvedValue([
      { id: 1, alert_kind: 'coverage_gap', severity: 'warn', source_slug: 'foo', detail: { gap: '5%' }, created_at: new Date().toISOString(), acked_at: null },
    ]);
    render(<AlertsTab />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Coverage gap/)).toBeInTheDocument());
    expect(screen.getByText('warn')).toBeInTheDocument();
    expect(screen.getByText('foo')).toBeInTheDocument();
  });
});
