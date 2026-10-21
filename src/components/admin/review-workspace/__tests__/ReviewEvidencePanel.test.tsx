import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReviewItem } from '@/hooks/useAdminReview';
import { ReviewEvidencePanel } from '../ReviewEvidencePanel';
import { reviewCitations, reviewHttpUrl } from '../reviewEvidence';
const state = vi.hoisted(() => ({ context: {} as Record<string, unknown>, reload: vi.fn() }));
vi.mock('@/hooks/useReviewContext', () => ({
  useReviewContext: () => ({ ...state.context, refetch: state.reload }),
}));
const item = {
  queue_type: 'liveness',
  title: 'Community centre',
  created_at: '2026-10-20T12:00:00Z',
  confidence_score: 0.8,
  meta: {},
} as ReviewItem;
beforeEach(() => {
  state.context = {};
  state.reload.mockReset();
});
describe('review evidence', () => {
  it('shows the current identity, quoted sources and timestamped signals on the decision page', () => {
    state.context = {
      data: {
        record: {
          name: 'Community centre',
          address: '42 Main Street',
          website: 'https://example.org',
        },
        location: 'Zürich, Switzerland',
        signals: [
          {
            signal_kind: 'http_status',
            verdict: 'dead',
            observed_at: '2026-10-20',
            details: { status: 404 },
          },
        ],
      },
    };
    render(
      <ReviewEvidencePanel
        item={{
          ...item,
          meta: {
            citations: [
              { url: 'https://example.org/update', quote: 'We have moved to 42 Main Street.' },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText('Community centre · Zürich, Switzerland')).toBeVisible();
    expect(screen.getByText('42 Main Street')).toBeVisible();
    expect(screen.getByText(/We have moved/)).toBeVisible();
    expect(screen.getByRole('region', { name: 'Recent existence signals' })).toHaveTextContent(
      '404',
    );
    expect(screen.getByText(/broken website or a past event/)).toBeVisible();
    expect(screen.getByText(/not verification/)).toBeVisible();
  });
  it('makes unavailable evidence explicit and supports retrying a failed live read', () => {
    state.context = { isError: true };
    render(<ReviewEvidencePanel item={item} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.getByText(/No source link or supporting quotation/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reload current record' }));
    expect(state.reload).toHaveBeenCalledOnce();
  });
  it('distinguishes live values from the proposal snapshot', () => {
    state.context = { data: { record: { category: 'bar' }, location: null, signals: [] } };
    render(
      <ReviewEvidencePanel
        item={{
          ...item,
          queue_type: 'quality-other',
          meta: { field: 'category', current_value: 'club', proposed_value: 'cafe' },
        }}
      />,
    );
    expect(screen.getByText('Current category').parentElement).toHaveTextContent('bar');
    expect(screen.getByText('Proposed category').parentElement).toHaveTextContent('cafe');
  });
  it('does not treat arbitrary metadata or unsafe links as sources', () => {
    expect(reviewHttpUrl('javascript:alert(1)')).toBeNull();
    expect(reviewHttpUrl('https://user:secret@example.org')).toBeNull();
    expect(
      reviewCitations({
        unrelated: 'https://example.org',
        evidence: { url: 'javascript:alert(1)' },
      }),
    ).toEqual([]);
    expect(
      reviewCitations({ citations: [{ url: 'https://example.org', quote: 'Source quotation' }] }),
    ).toHaveLength(1);
  });
});
