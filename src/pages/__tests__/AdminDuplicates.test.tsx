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
const mergeSpy = vi.fn().mockResolvedValue({ data: { audit_id: 'au1' }, error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => {
      if (name === 'find_duplicate_clusters') return Promise.resolve({ data: [cluster], error: null });
      if (name === 'merge_venues') return mergeSpy(name, args);
      return Promise.resolve({ data: {}, error: null });
    },
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
  it('renders a venue cluster and suggests the higher-quality canonical', async () => {
    renderWithProviders(<AdminDuplicates />);
    await waitFor(() => expect(screen.getByText('Duplicate venues')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('440-castro')).toBeInTheDocument());
    // v1 (quality 80) should be the suggested canonical, not v2 (quality 50).
    expect(screen.getByText('canonical')).toBeInTheDocument();
  });

  it('merges the cluster on click', async () => {
    renderWithProviders(<AdminDuplicates />);
    const btn = await screen.findByRole('button', { name: /Merge 1 into selected/ });
    fireEvent.click(btn);
    await waitFor(() => expect(mergeSpy).toHaveBeenCalledWith('merge_venues', { p_keep_id: 'v1', p_drop_id: 'v2' }));
  });
});
