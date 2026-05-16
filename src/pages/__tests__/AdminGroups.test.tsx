/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: true, canManageContent: () => true }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ deleteCommunityGroup: vi.fn() }));
vi.mock('@/hooks/useGroupJoinRequests', () => ({
  useGroupJoinRequests: () => ({
    requests: [], isLoading: false,
    approve: vi.fn(), isApproving: false,
    reject: vi.fn(), isRejecting: false,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({ AdminDataTable: () => <div>table</div> }));

import AdminGroups from '../AdminGroups';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('AdminGroups', () => {
  it('renders without crashing', () => {
    const { container } = render(<AdminGroups />, { wrapper });
    expect(container).toBeTruthy();
  });
});
