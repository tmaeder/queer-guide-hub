/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const queueState = vi.hoisted(() => ({ items: [] as Array<Record<string, unknown>>, total: 0 }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useUnifiedTriageQueue', () => ({
  useUnifiedTriageQueue: () => ({ data: queueState, isLoading: false, error: null }),
  useTriageAction: () => ({ mutate: vi.fn(), isPending: false }),
  useHighConfCount: () => ({ data: 0, refetch: vi.fn() }),
  useBulkApproveHighConf: () => ({ mutate: vi.fn(), isPending: false }),
  AUTO_DECISION_MIN_CONFIDENCE: 0.8,
}));
vi.mock('@/hooks/useAdminCounts', () => ({ useAdminCounts: () => ({ data: {} }) }));
// The cohort bar's own data source. Mocked to empty so these suites keep
// testing what they are about; QualityCohortBar returns null on an empty list,
// so the tree is unchanged. Its behaviour is covered by its own suite.
vi.mock('@/hooks/useReviewQueueCohorts', () => ({
  useReviewQueueCohorts: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useTriageSourceCapabilities', () => ({
  useTriageSourceCapabilities: () => ({
    externalConsoleFor: () => null,
    canReopenFor: () => true,
    loading: false,
  }),
}));
vi.mock('@/components/admin/review/ReviewBulkBar', () => ({ ReviewBulkBar: () => null }));
vi.mock('../TriageFilterBar', () => ({ TriageFilterBar: () => null }));
vi.mock('../TriageList', () => ({ TriageList: () => null }));
vi.mock('../TriageDetailPanel', () => ({
  TriageDetailPanel: ({ item }: { item: { id: string } }) => <div>Detail {item.id}</div>,
}));
vi.mock('../useTriageKeyboard', () => ({ useTriageKeyboard: () => undefined }));

import { TriageView } from '../TriageView';

describe('TriageView', () => {
  it('renders without crashing', () => {
    queueState.items = [];
    queueState.total = 0;
    const { container } = render(<TriageView />);
    expect(container).toBeTruthy();
  });

  it('guides the first decision and opens the first queue item', () => {
    queueState.items = [
      {
        id: 'first',
        title: 'First item',
        queue_type: 'staging',
        content_type: 'venues',
        confidence_score: 0.5,
        created_at: '2026-09-30T12:00:00Z',
        has_diff: false,
      },
    ];
    queueState.total = 1;
    render(<TriageView />);
    expect(screen.getByRole('heading', { name: 'Choose a review item' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Review first item/ }));
    expect(screen.getByText('Detail first')).toBeInTheDocument();
  });

  it('lets keyboard users resize the queue and preview panes', () => {
    queueState.items = [];
    queueState.total = 0;
    render(<TriageView />);
    const separator = screen.getByRole('separator', { name: 'Resize queue and preview' });
    expect(separator).toHaveAttribute('aria-valuenow', '36');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '39');
  });
});
