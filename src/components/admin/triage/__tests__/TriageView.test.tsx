/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useUnifiedTriageQueue', () => ({
  useUnifiedTriageQueue: () => ({ data: { items: [], total: 0 }, isLoading: false, error: null }),
  useTriageAction: () => ({ mutate: vi.fn(), isPending: false }),
  useHighConfCount: () => ({ data: 0, refetch: vi.fn() }),
  useBulkApproveHighConf: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useReviewCounts', () => ({ useReviewCounts: () => ({ data: {} }) }));
// The cohort bar's own data source. Mocked to empty so these suites keep
// testing what they are about; QualityCohortBar returns null on an empty list,
// so the tree is unchanged. Its behaviour is covered by its own suite.
vi.mock('@/hooks/useReviewQueueCohorts', () => ({
  useReviewQueueCohorts: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/components/admin/review/ReviewBulkBar', () => ({ ReviewBulkBar: () => null }));
vi.mock('../TriageFilterBar', () => ({ TriageFilterBar: () => null }));
vi.mock('../TriageList', () => ({ TriageList: () => null }));
vi.mock('../TriageDetailPanel', () => ({ TriageDetailPanel: () => null }));
vi.mock('../useTriageKeyboard', () => ({ useTriageKeyboard: () => undefined }));

import { TriageView } from '../TriageView';

describe('TriageView', () => {
  it('renders without crashing', () => {
    const { container } = render(<TriageView />);
    expect(container).toBeTruthy();
  });
});
