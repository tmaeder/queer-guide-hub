/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useQueerVillages', () => ({
  useQueerVillages: () => ({ data: [], isLoading: false, createVillage: vi.fn(), updateVillage: vi.fn(), deleteVillage: vi.fn() }),
}));
vi.mock('@/hooks/usePageFetchers', () => ({ fetchAllCitiesAndCountries: vi.fn().mockResolvedValue({ cities: [], countries: [] }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({ AdminDataTable: () => <div>table</div> }));

import AdminQueerVillages from '../AdminQueerVillages';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('AdminQueerVillages', () => {
  it('renders without crashing', () => {
    const { container } = render(<AdminQueerVillages />, { wrapper });
    expect(container).toBeTruthy();
  });
});
