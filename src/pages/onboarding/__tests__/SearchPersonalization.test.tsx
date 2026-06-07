/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/searchClient', () => ({
  submitOnboarding: vi.fn().mockResolvedValue({}),
  fetchAutocomplete: vi.fn().mockResolvedValue([]),
}));

import SearchPersonalization from '../SearchPersonalization';

describe('SearchPersonalization', () => {
  it('renders without crashing', () => {
    // useProfile() (added in #1482) calls useQueryClient, so a provider is required.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SearchPersonalization />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
