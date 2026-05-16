/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/usePageFetchers', () => ({
  insertInto: vi.fn(), updateRow: vi.fn(), deleteRow: vi.fn(),
}));
vi.mock('@/hooks/usePersonalities', () => ({
  usePersonalities: () => ({ updatePersonality: vi.fn(), refetchPersonalities: vi.fn() }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({ AdminDataTable: () => <div>table</div> }));

import AdminPersonalities from '../AdminPersonalities';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('AdminPersonalities', () => {
  it('renders without crashing', () => {
    const { container } = render(<AdminPersonalities />, { wrapper });
    expect(container).toBeTruthy();
  });
});
