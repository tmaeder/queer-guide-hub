import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ReviewTaskDetail } from '../ReviewTaskDetail';
import type { ReviewItem } from '@/hooks/useAdminReview';
vi.mock('../ReviewEvidencePanel', () => ({ ReviewEvidencePanel: () => <div>Evidence panel</div> }));
vi.mock('@/components/admin/shell/AdminShell', () => ({
  useAdminShell: () => ({ openEditor: vi.fn() }),
}));
vi.mock('@/hooks/useAdminReview', () => ({
  useReviewLookup: () => ({ data: [], isFetching: false, isError: false }),
}));
const base = {
  id: 'id',
  title: 'Example',
  source_label: 'Review',
  meta: {},
  risk: 'safety',
  risk_flags: {},
  entity_table: null,
  entity_id: null,
} as ReviewItem;
function renderTask(queue_type: string, overrides: Partial<ReviewItem> = {}) {
  const onDecision = vi.fn();
  render(
    <ReviewTaskDetail
      item={{ ...base, queue_type, ...overrides }}
      busy={false}
      onDecision={onDecision}
      onSkip={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  return onDecision;
}
describe('inline decisions', () => {
  it('preserves the full editorial prose when approving a corrected draft', () => {
    const prose = 'A complete source-grounded description. '.repeat(100);
    const decide = renderTask('editorial', {
      meta: { draft_hook: 'A reviewed hook', draft_long: prose },
    });
    expect(screen.getByLabelText('Reviewed description')).toHaveValue(prose);
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish draft' }));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ draft_hook: 'A reviewed hook', draft_long: prose }),
      }),
    );
  });
  it('requires explicit confirmation before indexing a sensitive tag', () => {
    const decide = renderTask('sensitive-tags', { risk_flags: { requires_confirm: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve & index' }));
    expect(decide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/I checked the evidence/));
    fireEvent.click(screen.getByRole('button', { name: 'Approve & index' }));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'approve', confirm: true }),
    );
  });
  it('allows keeping a sensitive tag hidden without pretending to approve exposure', () => {
    const decide = renderTask('sensitive-tags', { risk_flags: { requires_confirm: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Reviewed, keep hidden' }));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reject', confirm: false }),
    );
  });
  it('requires evidence and confirmation before sensitive ownership claims publish', () => {
    const decide = renderTask('brand-ownership', { meta: { suggested_tags: ['queer_owned'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify & publish' }));
    expect(decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Evidence or review note'), {
      target: { value: 'Verified public ownership source' },
    });
    fireEvent.click(screen.getByLabelText(/I checked the evidence/));
    fireEvent.click(screen.getByRole('button', { name: 'Verify & publish' }));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ tags: ['queer_owned'] }) }),
    );
  });
  it('does not mint a business without an explicit choice', () => {
    const decide = renderTask('org-link-review');
    fireEvent.click(screen.getByRole('button', { name: 'Link business' }));
    expect(decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Business adoption strategy'), {
      target: { value: 'new' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link business' }));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ organization_id: null }) }),
    );
  });
  it('requires a review note before accepting an event quality exception', () => {
    const decide = renderTask('event-quality', { meta: { severity: 'high' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept exception' }));
    expect(decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Evidence or review note'), {
      target: { value: 'Documented exception' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept exception' }));
    expect(decide).toHaveBeenCalled();
  });
});
