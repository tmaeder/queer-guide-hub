/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useRedirects', () => ({
  useRedirects: () => ({
    createRedirect: vi.fn(), updateRedirect: vi.fn(), deleteRedirect: vi.fn(),
    toggleEnabled: vi.fn(), fetchEvents: vi.fn().mockResolvedValue([]), bulkImport: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePageFetchers', () => ({ fetchRedirectById: vi.fn().mockResolvedValue(null) }));
vi.mock('@/components/admin/data-table/AdminDataTable', () => ({ AdminDataTable: () => <div>table</div> }));
vi.mock('@/pages/admin-redirects/RedirectFormDialog', () => ({ RedirectFormDialog: () => null }));
vi.mock('@/pages/admin-redirects/BulkImportDialog', () => ({ BulkImportDialog: () => null }));
vi.mock('@/pages/admin-redirects/PreviewDialog', () => ({ PreviewDialog: () => null }));

import AdminRedirects from '../AdminRedirects';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}><TooltipProvider>{children}</TooltipProvider></QueryClientProvider></MemoryRouter>;
}

describe('AdminRedirects', () => {
  it('renders without crashing', () => {
    const { container } = render(<AdminRedirects />, { wrapper });
    expect(container).toBeTruthy();
  });
});
