/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useBusinessSpine', () => ({
  useBusinessBrandQualityStats: () => ({
    data: {
      latest: {
        id: 1,
        taken_at: '2026-09-22T08:00:00Z',
        stats: {
          organizations_total: 6414,
          organizations_open: 20,
          brands_total: 5112,
          brands_open: 30,
          ownership_needs_review: 12,
          brand_product_count_drift: 3,
        },
        by_role: {},
        by_brand_state: {},
      },
      previous: null,
      open_findings: 50,
      by_dimension: [],
    },
  }),
  useBusinessBrandQualityFindings: () => ({
    data: [
      {
        id: 7,
        entity_type: 'marketplace_brand',
        entity_id: 'brand-1',
        entity_name: 'Example Brand',
        dimension: 'ownership',
        state: 'fail',
        reason_code: 'ownership_evidence_missing',
        evidence: { tags: ['queer_owned'] },
        checked_at: '2026-09-22T08:00:00Z',
        waived_at: null,
        waiver_note: null,
      },
    ],
    isLoading: false,
  }),
  useResolveBusinessBrandQualityFindings: () => ({ mutateAsync, isPending: false }),
}));

import { BusinessBrandQualityPanel } from '../BusinessBrandQualityPanel';

beforeEach(() => mutateAsync.mockReset().mockResolvedValue({ changed: 1 }));

describe('BusinessBrandQualityPanel', () => {
  it('shows coverage totals and unresolved evidence', () => {
    render(<BusinessBrandQualityPanel />);
    expect(screen.getByText('6414')).toBeInTheDocument();
    expect(screen.getByText('Example Brand')).toBeInTheDocument();
    expect(screen.getByText('Ownership evidence missing')).toBeInTheDocument();
  });

  it('requires a reason and sends an auditable bulk waiver', async () => {
    render(<BusinessBrandQualityPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Example Brand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Waive 1' }));
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText(/Why is this not applicable/i), {
      target: { value: 'Verified exception' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Waive 1' }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        ids: [7],
        action: 'waive',
        note: 'Verified exception',
      }),
    );
  });
});
