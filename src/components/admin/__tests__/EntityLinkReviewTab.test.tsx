/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { eqMock, updateMock } = vi.hoisted(() => ({
  eqMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({
              data: [{
                id: 'r1', article_id: 'a1', entity_type: 'venue',
                candidate_name: 'Pride Bar', candidate_id: null,
                score: 0.9, context_snippet: 'context...',
                status: 'pending', created_at: 'now',
                news_articles: { id: 'a1', title: 'Article X', url: null },
              }],
              error: null,
            }),
          })),
        })),
      })),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    })),
  },
}));

import EntityLinkReviewTab from '../EntityLinkReviewTab';
void eqMock; void updateMock;

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('EntityLinkReviewTab', () => {
  it('renders type filter chips', async () => {
    render(<EntityLinkReviewTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('Pride Bar')).toBeInTheDocument());
    ['all', 'country', 'event'].forEach(t => {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    });
  });

  it('renders pending row with Approve + Reject', async () => {
    render(<EntityLinkReviewTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('Pride Bar')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Approve/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reject/ })).toBeInTheDocument();
  });

  it('filter chip click changes filter', async () => {
    render(<EntityLinkReviewTab />, { wrapper });
    await waitFor(() => expect(screen.getAllByText('venue').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('venue')[0]);
  });
});
