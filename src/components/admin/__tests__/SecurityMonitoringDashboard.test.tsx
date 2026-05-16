/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/usePageFetchers', () => ({
  listFrom: vi.fn().mockResolvedValue([]),
  countRows: vi.fn().mockResolvedValue(0),
}));

import { SecurityMonitoringDashboard } from '../SecurityMonitoringDashboard';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('SecurityMonitoringDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<SecurityMonitoringDashboard />, { wrapper });
    expect(container).toBeTruthy();
  });
});
