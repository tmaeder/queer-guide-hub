/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { callMock, searchMock } = vi.hoisted(() => ({
  callMock: vi.fn(), searchMock: vi.fn(),
}));

vi.mock('@/hooks/usePageFetchers', () => ({ searchUnifiedTagsByName: searchMock }));
vi.mock('@/hooks/useSearchIntelligence', () => ({ callSearchIntelligence: callMock }));

import { ClusterTagPicker } from '../ClusterTagPicker';

beforeEach(() => {
  callMock.mockReset();
  searchMock.mockReset();
});

describe('ClusterTagPicker', () => {
  it('shows loading state while fetching', () => {
    callMock.mockReturnValue(new Promise(() => {}));
    render(<ClusterTagPicker clusterId="c1" />);
    expect(screen.getByText(/Loading tags/)).toBeInTheDocument();
  });

  it('renders linked tags after fetch', async () => {
    callMock.mockResolvedValue({
      success: true,
      data: {
        cluster: { id: 'c1', name: 'C1' },
        tags: [{ tag_id: 't1', weight: 1, added_at: 'now', unified_tags: { id: 't1', name: 'queer', slug: 'queer' } }],
        entity_counts: [{ entity_type: 'venue', entity_count: 3 }],
      },
    });
    render(<ClusterTagPicker clusterId="c1" />);
    await waitFor(() => expect(screen.getByText('queer')).toBeInTheDocument());
    expect(screen.getByText(/3 venues/)).toBeInTheDocument();
  });

  it('shows error alert when call fails', async () => {
    callMock.mockResolvedValue({ success: false, error: 'rls' });
    render(<ClusterTagPicker clusterId="c1" />);
    await waitFor(() => expect(screen.getByText('rls')).toBeInTheDocument());
  });
});
