/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { useQueueMock } = vi.hoisted(() => ({ useQueueMock: vi.fn() }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useTagSuggestionsQueue', () => ({
  usePendingTagSuggestions: useQueueMock,
  fetchAllPendingTagSuggestionIds: vi.fn().mockResolvedValue([]),
  rejectTagSuggestions: vi.fn().mockResolvedValue(0),
}));

import { TagSuggestionsQueue } from '../TagSuggestionsQueue';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => useQueueMock.mockReset());

describe('TagSuggestionsQueue', () => {
  it('renders without crashing on empty data', async () => {
    useQueueMock.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false });
    const { container } = render(<TagSuggestionsQueue />, { wrapper });
    await waitFor(() => expect(container).toBeTruthy());
  });
});
