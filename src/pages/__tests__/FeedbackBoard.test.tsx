/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useFeedbackVote', () => ({ useFeedbackVoteCounts: () => ({ data: {} }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({
  fetchFeedbackBoardItems: vi.fn().mockResolvedValue([]),
  toggleFeedbackVote: vi.fn().mockResolvedValue(true),
}));

import FeedbackBoard from '../FeedbackBoard';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <MemoryRouter><QueryClientProvider client={qc}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('FeedbackBoard', () => {
  it('renders without crashing', () => {
    const { container } = render(<FeedbackBoard />, { wrapper });
    expect(container).toBeTruthy();
  });
});
