/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useResourceTopic', () => ({
  useTopicGuides: () => ({ data: [], isLoading: false }),
  useTopicOrgs: () => ({ data: [], isLoading: false }),
  useTopicNews: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/components/venues/VenueCard', () => ({ VenueCard: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({ LocalizedLink: ({ children }: { children: ReactNode }) => <span>{children}</span> }));

import ResourceTopic from '../ResourceTopic';

describe('ResourceTopic', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <MemoryRouter initialEntries={['/resources/topic/safety']}>
        <QueryClientProvider client={qc}>
          <Routes><Route path="/resources/topic/:slug" element={<ResourceTopic />} /></Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
