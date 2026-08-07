/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useRecommendations', () => ({ useRecommendations: () => ({ data: [], isLoading: false }) }));

import { BookNowAccordion } from '../BookNowAccordion';

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <BookNowAccordion />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('BookNowAccordion', () => {
  it('renders closed by default (no booking tabs visible)', () => {
    const { queryByRole } = renderAt('/travel');
    expect(queryByRole('button', { name: 'Flights' })).toBeNull();
  });

  it('opens when a ?tab= deep link is present', () => {
    const { getByRole } = renderAt('/travel?tab=hotels');
    expect(getByRole('button', { name: 'Hotels' })).toBeTruthy();
  });

  it('opens when a ?city= deep link is present', () => {
    const { getByRole } = renderAt('/travel?city=Berlin');
    expect(getByRole('button', { name: 'Flights' })).toBeTruthy();
  });
});
