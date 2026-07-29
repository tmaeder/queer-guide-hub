/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useRecognitions', () => ({
  useAdminRecognitions: () => ({ data: [], isLoading: false }),
  useContributionMetrics: () => ({ data: [], isLoading: false }),
  useRecognitionMutations: () => ({
    upsert: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(null), isPending: false },
    remove: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(null), isPending: false },
    refreshMetrics: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(null), isPending: false },
  }),
}));

import AdminRecognition from '../Recognition';

// AdminPageHeader reads useLocation() to derive the route eyebrow, so the page
// now needs a Router — it always has one in the app, where every admin page
// renders inside AdminShell's <Outlet />.
function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/admin/recognition']}>
      <QueryClientProvider client={qc}>
        <AdminRecognition />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AdminRecognition', () => {
  it('renders without crashing', () => {
    const { container } = renderPage();
    expect(container).toBeTruthy();
  });

  it('renders its title through AdminPageHeader as a real h1', () => {
    renderPage();
    const heading = screen.getByRole('heading', { name: 'Recognition Wall' });
    expect(heading.tagName).toBe('H1');
  });
});
