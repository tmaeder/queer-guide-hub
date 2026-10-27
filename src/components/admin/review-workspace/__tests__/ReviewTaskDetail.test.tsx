import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ReviewTaskDetail } from '../ReviewTaskDetail';
import type { ReviewItem } from '@/hooks/useAdminReview';
vi.mock('../VenueMatchPanel', () => ({
  VenueMatchPanel: ({ onSelect }: { onSelect: (value: unknown) => void }) => (
    <button onClick={() => onSelect({ venue_id: 'venue', expected_updated_at: 'timestamp' })}>
      Select verified venue
    </button>
  ),
}));
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
  it('applies venue matching through a selected live candidate, never a generic resolved flag', () => {
    const decide = renderTask('general-review', {
      entity_table: 'events',
      entity_id: 'event',
      meta: { review_type: 'venue_link_candidate' },
    });
    expect(screen.getByRole('button', { name: 'Link selected venue' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Dismiss finding' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select verified venue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link selected venue' }));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ venue_id: 'venue', expected_updated_at: 'timestamp' }),
      }),
    );
  });
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
  it('sends the confirmation with the approval for a sensitive tag, with no extra checkbox', () => {
    const decide = renderTask('sensitive-tags', { risk_flags: { requires_confirm: true } });
    expect(screen.queryByLabelText(/I checked the evidence/)).toBeNull();
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
  it('requires evidence before sensitive ownership claims publish', () => {
    const decide = renderTask('brand-ownership', { meta: { suggested_tags: ['queer_owned'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify & publish' }));
    expect(decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Evidence or review note'), {
      target: { value: 'Verified public ownership source' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify & publish' }));
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        confirm: true,
        payload: expect.objectContaining({ tags: ['queer_owned'] }),
      }),
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
