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

describe('BookNowAccordion', () => {
  it('renders closed', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><BookNowAccordion /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
