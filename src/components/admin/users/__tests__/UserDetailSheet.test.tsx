/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: vi.fn().mockResolvedValue([]) }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => ({ isAdmin: true }) }));
vi.mock('@/hooks/useSecureRoleManagement', () => ({
  useSecureRoleManagement: () => ({ assignRole: vi.fn(), removeRole: vi.fn(), loading: false }),
}));

import { UserDetailSheet } from '../UserDetailSheet';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider>;
}

describe('UserDetailSheet', () => {
  it('renders closed when open=false', () => {
    const { container } = render(
      <UserDetailSheet user={null} open={false} onOpenChange={vi.fn()} onUserUpdated={vi.fn()} />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});
