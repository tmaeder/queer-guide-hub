/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const cluster = {
  city: 'San Francisco',
  count: 2,
  normalized_title: '440 castro',
  members: [
    { id: 'v1', title: '440 Castro', slug: '440-castro', city: 'San Francisco', country: 'US' },
    { id: 'v2', title: '440 Castro', slug: '440-castro-3', city: 'San Francisco', country: 'US' },
  ],
};

const rpcSpy = vi.fn((name: string) => {
  if (name === 'find_duplicate_clusters') return Promise.resolve({ data: [cluster], error: null });
  // tag cockpit reads — return empty so TagMergeReviewQueue renders cleanly
  if (name === 'tag_merge_queue' || name === 'tag_merge_recent')
    return Promise.resolve({ data: [], error: null });
  if (name === 'merge_venues' || name === 'merge_cities' || name === 'merge_entities')
    return Promise.resolve({ data: { audit_id: 'au1' }, error: null });
  return Promise.resolve({ data: {}, error: null });
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => rpcSpy(name, args),
    from: () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [
              { id: 'v1', quality_score: 80, trust_score: 70, images: ['x.jpg'], created_at: '2024-01-01', is_featured: false },
              { id: 'v2', quality_score: 50, trust_score: 40, images: [], created_at: '2025-01-01', is_featured: false },
            ],
            error: null,
          }),
      }),
    }),
  },
}));

import AdminDuplicates from '../AdminDuplicates';

describe('AdminDuplicates', () => {
  it('builds the type selector from the registry (beyond the old hardcoded four)', async () => {
    renderWithProviders(<AdminDuplicates />);
    await waitFor(() => expect(screen.getByText('Duplicates & merge')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Venues' })).toBeInTheDocument();
    // Cities is registry-driven — it was NOT in the old hardcoded list.
    expect(screen.getByRole('button', { name: 'Cities' })).toBeInTheDocument();
  });

  it('renders a cluster and suggests the higher-quality canonical', async () => {
    renderWithProviders(<AdminDuplicates />);
    await waitFor(() => expect(screen.getByText('2 copies')).toBeInTheDocument());
    expect(screen.getByText('440-castro')).toBeInTheDocument();
    // v1 (quality 80) should be the suggested canonical, not v2 (quality 50).
    expect(screen.getByText('canonical')).toBeInTheDocument();
  });

  it('routes a venue merge to the dedicated merge_venues RPC', async () => {
    renderWithProviders(<AdminDuplicates />);
    const btn = await screen.findByRole('button', { name: /Merge 1 into selected/ });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(rpcSpy).toHaveBeenCalledWith('merge_venues', { p_keep_id: 'v1', p_drop_id: 'v2' }),
    );
  });

  it('routes a city merge to merge_cities (mergePath="city")', async () => {
    renderWithProviders(<AdminDuplicates />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cities' }));
    const btn = await screen.findByRole('button', { name: /Merge 1 into selected/ });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(rpcSpy).toHaveBeenCalledWith('merge_cities', { p_keep_id: 'v1', p_drop_id: 'v2' }),
    );
  });

  it('switches to the taxonomy cockpit', async () => {
    renderWithProviders(<AdminDuplicates />);
    fireEvent.click(screen.getByRole('tab', { name: 'Taxonomies' }));
    await waitFor(() => expect(screen.getByText(/keep distinct/i)).toBeInTheDocument());
  });
});
