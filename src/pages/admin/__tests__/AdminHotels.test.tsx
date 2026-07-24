/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useHotels', () => ({
  useHotels: () => ({ createHotel: vi.fn(), updateHotel: vi.fn(), deleteHotel: vi.fn(), refetch: vi.fn() }),
}));
vi.mock('@/hooks/useAddressResolver', () => ({ useAddressResolver: () => ({ resolveAddress: vi.fn() }) }));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({ AdminDataTable: () => <div>table</div> }));

import AdminHotels from '../AdminHotels';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('AdminHotels', () => {
  it('renders without crashing', () => {
    const { container } = render(<AdminHotels />, { wrapper });
    expect(container).toBeTruthy();
  });
});
