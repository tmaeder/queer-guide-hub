/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

import { renderWithProviders } from '@/test/test-utils';
import { TooltipProvider } from '@/components/ui/tooltip';

// Keep the real widget query hooks (they return loading under the test
// QueryClient) and only stub the top-level cockpit hook.
vi.mock('@/hooks/useAdminCockpit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAdminCockpit')>();
  return {
    ...actual,
    useAdminCockpit: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
  };
});
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
// The rebuilt cockpit resolves its layout through useCockpitLayout, which reads
// identity + profile. Mock both so the test needs no AuthProvider or Supabase
// session; renderWithProviders supplies the QueryClient + Router the subtree
// (useCockpitLayout's queryClient, useAdminCounts, AdminPageHeader) requires.
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null }),
  profileQueryKey: (id: string) => ['profile', id],
}));

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
    const { container } = renderWithProviders(
      <TooltipProvider>
        <AdminDashboard />
      </TooltipProvider>,
    );
    expect(container).toBeTruthy();
  });
});
