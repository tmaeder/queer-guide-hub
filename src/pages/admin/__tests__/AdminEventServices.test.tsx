/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useTaxonomyCRUD', () => ({
  useTaxonomyCRUD: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({ AdminDataTable: () => <div>table</div> }));

import AdminEventServices from '../AdminEventServices';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('AdminEventServices', () => {
  it('renders without crashing', () => {
    const { container } = render(<AdminEventServices />, { wrapper });
    expect(container).toBeTruthy();
  });
});
