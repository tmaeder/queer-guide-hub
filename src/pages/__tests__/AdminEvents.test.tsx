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
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(), refetch: vi.fn() }) }));
vi.mock('@/hooks/useVenues', () => ({ useVenues: () => ({ venues: [], loading: false, fetchVenues: vi.fn() }) }));
vi.mock('@/hooks/useAddressResolver', () => ({ useAddressResolver: () => ({ resolveAddress: vi.fn() }) }));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({ AdminDataTable: () => <div>table</div> }));

import AdminEvents from '../AdminEvents';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('AdminEvents', () => {
  it('renders without crashing', () => {
    const { container } = render(<AdminEvents />, { wrapper });
    expect(container).toBeTruthy();
  });
});
