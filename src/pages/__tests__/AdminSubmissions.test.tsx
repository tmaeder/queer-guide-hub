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
vi.mock('@/hooks/usePageFetchers', () => ({
  listFromWhere: vi.fn().mockResolvedValue([]),
  updateRow: vi.fn().mockResolvedValue({}),
  deleteRow: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/hooks/useFeedbackAudit', () => ({ useFeedbackAudit: () => ({ data: [], log: vi.fn() }) }));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({ AdminDataTable: () => <div>table</div> }));

import AdminSubmissions from '../AdminSubmissions';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('AdminSubmissions', () => {
  it('renders without crashing', () => {
    const { container } = render(<AdminSubmissions />, { wrapper });
    expect(container).toBeTruthy();
  });
});
