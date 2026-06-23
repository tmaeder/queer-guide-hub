/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/hooks/useGranularRoles', () => ({
  useGranularRoles: () => ({ effectiveRole: 'admin', loading: false }),
}));
vi.mock('@/hooks/useCockpitLayout', () => ({
  useCockpitLayout: () => ({
    widgets: [],
    eligible: [],
    visibleIds: new Set<string>(),
    pinned: [],
    totalWidgets: 0,
    toggleVisible: vi.fn(),
    reorder: vi.fn(),
    togglePin: vi.fn(),
    resetToDefault: vi.fn(),
  }),
}));
vi.mock('@/hooks/useCockpitRealtime', () => ({ useCockpitRealtime: () => {} }));

import AdminDashboard from '../AdminDashboard';

describe('AdminDashboard', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <TooltipProvider>
            <AdminDashboard />
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
