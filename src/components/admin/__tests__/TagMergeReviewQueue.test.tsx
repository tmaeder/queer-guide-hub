/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { TagMergeReviewQueue } from '../TagMergeReviewQueue';

const queueRows = [
  {
    review_id: 'rev-1',
    similarity: 0.92,
    lexical_variant: true,
    created_at: '2026-07-24T00:00:00Z',
    canonical_id: 'can-1',
    canonical_name: 'Leather',
    canonical_slug: 'leather',
    canonical_usage: 120,
    canonical_category: 'kink',
    duplicate_id: 'dup-1',
    duplicate_name: 'Leathers',
    duplicate_slug: 'leathers',
    duplicate_usage: 4,
    duplicate_category: 'kink',
  },
  {
    review_id: 'rev-2',
    similarity: 0.75,
    lexical_variant: false,
    created_at: '2026-07-24T00:00:00Z',
    canonical_id: 'can-2',
    canonical_name: 'Karaoke',
    canonical_slug: 'karaoke',
    canonical_usage: 50,
    canonical_category: 'nightlife',
    duplicate_id: 'dup-2',
    duplicate_name: 'Karaoke Night',
    duplicate_slug: 'karaoke-night',
    duplicate_usage: 3,
    duplicate_category: 'nightlife',
  },
];

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mockRpcDefault() {
  rpc.mockImplementation((fn: string) => {
    if (fn === 'tag_merge_queue') return Promise.resolve({ data: queueRows, error: null });
    if (fn === 'tag_merge_recent') return Promise.resolve({ data: [], error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

describe('TagMergeReviewQueue', () => {
  beforeEach(() => {
    rpc.mockReset();
    mockRpcDefault();
  });

  it('renders the collapsed trigger with pending count', async () => {
    render(<TagMergeReviewQueue />, { wrapper });
    expect(
      await screen.findByRole('button', { name: /Merge review queue/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText('2 pending')).toBeInTheDocument();
  });

  it('shows both pairs with slugs and a lexical badge on the flagged one', async () => {
    render(<TagMergeReviewQueue />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Merge review queue/i }));

    expect(await screen.findByText('leathers')).toBeInTheDocument();
    expect(screen.getByText('leather')).toBeInTheDocument();
    expect(screen.getByText('karaoke-night')).toBeInTheDocument();
    expect(screen.getByText('karaoke')).toBeInTheDocument();
    expect(screen.getByText('lexical variant')).toBeInTheDocument();
  });

  it('Approve calls approve_tag_merge with the row review_id', async () => {
    render(<TagMergeReviewQueue />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Merge review queue/i }));
    await screen.findByText('leathers');

    const row = screen.getByText('leathers').closest('div.flex-col') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Approve/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('approve_tag_merge', { p_review_id: 'rev-1' }),
    );
  });

  it('keep-distinct toggle + Reject calls reject_tag_merge with p_add_exclusion true', async () => {
    render(<TagMergeReviewQueue />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Merge review queue/i }));
    await screen.findByText('leathers');

    const row = screen.getByText('leathers').closest('div.flex-col') as HTMLElement;
    fireEvent.click(within(row).getByRole('checkbox', { name: /keep distinct permanently/i }));
    fireEvent.click(within(row).getByRole('button', { name: /Reject/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('reject_tag_merge', {
        p_review_id: 'rev-1',
        p_add_exclusion: true,
      }),
    );
  });

  it('shows the empty state copy when the queue is empty', async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === 'tag_merge_queue') return Promise.resolve({ data: [], error: null });
      if (fn === 'tag_merge_recent') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: null, error: null });
    });
    render(<TagMergeReviewQueue />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Merge review queue/i }));
    expect(await screen.findByText('No pending merge proposals.')).toBeInTheDocument();
  });
});
