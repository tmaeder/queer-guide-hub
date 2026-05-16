/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/usePersonalities', () => ({ usePersonalities: () => ({ data: [], isLoading: false }) }));
vi.mock('@/components/discovery/SimilarItems', () => ({ SimilarItems: () => null }));
vi.mock('@/components/entity/EntityDetailLayout', () => ({ EntityDetailLayout: () => <div>layout</div> }));

import PersonalityDetail from '../PersonalityDetail';

describe('PersonalityDetail', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <MemoryRouter initialEntries={['/personalities/p1']}>
        <QueryClientProvider client={qc}>
          <Routes><Route path="/personalities/:slug" element={<PersonalityDetail />} /></Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
