import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({
  filters: vi.fn(),
  data: {
    items: [],
    total: 0,
    all_total: 25,
    decisions_total: 18,
    ready_total: 5,
    research_total: 7,
    blocked_total: 2,
    case_total: 14,
    findings_total: 7,
    overdue_total: 4,
    safety_total: 3,
    sources: [{ key: 'event-quality', label: 'Event issues', count: 25 }],
    page: 1,
    per_page: 50,
  },
  isError: false,
  isLoading: false,
}));
vi.mock('@/hooks/useAdminReview', () => ({
  // Mirrors the real constant. The page reads it for its default scope AND the sidebar summary
  // passes it, so the two share one request; a mock that drifted from the real value would let
  // the "defaults to decisions" assertion below pass against the wrong scope.
  DEFAULT_REVIEW_SCOPE: 'ready',
  useAdminReview: (filters: unknown) => {
    state.filters(filters);
    return { ...state, refetch: vi.fn() };
  },
  useReviewDecision: () => ({ reset: vi.fn(), mutate: vi.fn(), isPending: false }),
  useSelectedReviewItem: () => ({ data: null, isLoading: false }),
  useReviewBulk: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('@/hooks/useReviewCleanupStatus', () => ({
  useReviewCleanupStatus: () => ({
    data: { enabled: true, last_run_at: null, last_run_status: null },
    isLoading: false,
    isError: false,
    dataUpdatedAt: 0,
  }),
}));
vi.mock('@/components/admin/triage/TriageDetailPanel', () => ({ TriageDetailPanel: () => null }));
vi.mock('@/components/admin/review-workspace/ReviewTaskDetail', () => ({
  ReviewTaskDetail: () => null,
}));
vi.mock('@/hooks/useNewsStagingSummaries', () => ({
  useNewsReviewList: () => ({
    newsOf: () => undefined,
    reasonTitleFor: () => undefined,
    reasonTitles: undefined,
    groups: null,
  }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/components/admin/triage/TriageItemRow', () => ({ TriageItemRow: () => null }));
import AdminDashboard from '../AdminDashboard';
describe('admin landing review workspace', () => {
  it('shows one review workspace with the exact API total, without cockpit sections', () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Review queue', level: 1 })).toBeInTheDocument();
    // Distinct fixture figures on purpose: all_total 25 = decisions 18 + findings 7, so each
    // assertion names one population and cannot be satisfied by the other.
    expect(
      screen.getByRole('option', { name: 'All source rows & findings (25)' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('5')).toHaveLength(2);
    expect(screen.getByText(/14 cases from 18 source tasks/)).toBeInTheDocument();
    expect(screen.queryByText('Needs you')).not.toBeInTheDocument();
    expect(screen.getByText('Automatic cleanup runs every 5 minutes.')).toBeInTheDocument();
  });
  it('passes item-level overdue scope rather than choosing queues with overdue rows', () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Source task scope' }), {
      target: { value: 'overdue' },
    });
    expect(state.filters).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'overdue', queues: null }),
    );
  });
  it('groups AI and tag enrichment inside the same queue', () => {
    render(
      <MemoryRouter initialEntries={['/admin?family=enrichment']}>
        <AdminDashboard />
      </MemoryRouter>,
    );
    expect(state.filters).toHaveBeenCalledWith(
      expect.objectContaining({ queues: ['ai-suggestions', 'tag-enrichment'] }),
    );
  });
  it('restores a bookmarked filter and page', () => {
    render(
      <MemoryRouter initialEntries={['/admin?queue=event-quality&page=2&q=Festival']}>
        <AdminDashboard />
      </MemoryRouter>,
    );
    expect(state.filters).toHaveBeenCalledWith(
      expect.objectContaining({ queues: ['event-quality'], search: 'Festival', page: 2 }),
    );
  });
});
