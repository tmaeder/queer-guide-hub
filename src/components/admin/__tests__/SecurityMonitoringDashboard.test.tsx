/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/usePageFetchers', () => ({
  listFrom: vi.fn().mockResolvedValue([]),
  countRows: vi.fn().mockResolvedValue(0),
}));

import { SecurityMonitoringDashboard } from '../SecurityMonitoringDashboard';
import { listFrom } from '@/hooks/usePageFetchers';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <MemoryRouter initialEntries={['/admin/security']}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('SecurityMonitoringDashboard', () => {
  beforeEach(() => {
    vi.mocked(listFrom).mockReset().mockResolvedValue([]);
  });

  it('renders without crashing', () => {
    const { container } = render(<SecurityMonitoringDashboard />, { wrapper });
    expect(container).toBeTruthy();
  });

  it('announces the page while security events are still loading', () => {
    vi.mocked(listFrom).mockImplementation(() => new Promise(() => {}));
    render(<SecurityMonitoringDashboard />, { wrapper });
    expect(screen.getByRole('heading', { level: 1, name: 'Security Monitoring' })).toBeTruthy();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.queryByText('No recent security events')).toBeNull();
  });

  it('reports a failed fetch without claiming there were no events', async () => {
    vi.mocked(listFrom).mockRejectedValue(new Error('Request failed'));
    render(<SecurityMonitoringDashboard />, { wrapper });
    expect(
      await screen.findByText('Security events could not be loaded. Please try again.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Security Monitoring' })).toBeTruthy();
    expect(screen.queryByText('No recent security events')).toBeNull();
  });
});
