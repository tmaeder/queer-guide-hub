/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: [{ id: 's1', name: 'BBC News', source_type: 'rss', status: 'active', consecutive_failures: 0, auto_paused: false, reliability_score: 0.95, avg_articles_per_fetch: 12 }], error: null, count: 5 }),
      gte: () => chain,
    };
    return chain;
  },
}));

import NewsTab from '../NewsTab';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('NewsTab', () => {
  it('renders staging stats blocks', async () => {
    render(<NewsTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('Pending')).toBeInTheDocument());
    expect(screen.getByText('Committed')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('renders news source row', async () => {
    render(<NewsTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('BBC News')).toBeInTheDocument());
  });
});
