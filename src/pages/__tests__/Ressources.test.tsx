/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/providers/SafeModeProvider', () => ({ useSafeMode: () => false }));
vi.mock('@/hooks/useAgeAffirmation', () => ({ useAgeAffirmation: () => ({ affirmed: true, affirm: vi.fn() }) }));
vi.mock('@/hooks/useCentralizedTags', () => ({
  useCentralizedTags: () => ({ allTags: [], categoriesTree: [], isLoading: false }),
  useTagUsageCounts: () => ({ data: {}, isLoading: false }),
}));

import Ressources from '../Ressources';

describe('Ressources', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><Ressources /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
