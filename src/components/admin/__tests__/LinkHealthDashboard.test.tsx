/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useContentLinks', () => ({
  useContentLinks: () => ({
    links: [], stats: null, loading: false,
    fetchLinks: vi.fn(), fetchStats: vi.fn(),
    deleteLink: vi.fn(), deleteBulk: vi.fn(), dismissLink: vi.fn(), dismissBulk: vi.fn(),
    recheckLink: vi.fn(), recheckBulk: vi.fn(), validateLinks: vi.fn(),
    updateSourceUrl: vi.fn(), applyRedirect: vi.fn(), applyRedirectBulk: vi.fn(),
    scanLink: vi.fn(), scanBulk: vi.fn(), scanBatch: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePageFetchers', () => ({
  countRowsWhere: vi.fn().mockResolvedValue(0),
  fetchById: vi.fn().mockResolvedValue(null),
}));

import { LinkHealthDashboard } from '../LinkHealthDashboard';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('LinkHealthDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<LinkHealthDashboard />, { wrapper });
    expect(container).toBeTruthy();
  });
});
