/**
 * @vitest-environment jsdom
 *
 * The outing-safety confirm gate.
 *
 * `approve_entity_review` raises 42501 for every row where
 * `_review_risk_blocked` holds unless the caller passes `p_confirm`.
 * `triage_action` has forwarded that flag since it was written and
 * `useTriageAction` has always had the parameter — but no component ever set
 * it, so on prod 347 open proposals (346 of them criminalizing-destination
 * safety notes) could not be approved from the inbox by anyone. These tests
 * pin both halves: the flag reaches `onAction`, and it is withheld until a
 * human actually ticks the box.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useEntityDataMock, useStagingDataMock } = vi.hoisted(() => ({
  useEntityDataMock: vi.fn(),
  useStagingDataMock: vi.fn(),
}));

vi.mock('@/hooks/useTriageDetail', () => ({
  useEntityData: useEntityDataMock,
  useStagingData: useStagingDataMock,
}));
vi.mock('../EntityPreviewCard', () => ({
  EntityPreviewCard: () => <div data-testid="entity-preview" />,
}));
vi.mock('../FieldDiffView', () => ({
  FieldDiffView: () => <div data-testid="diff" />,
  computeFieldDiffs: () => [],
}));

// A real-enough ActionBar: it must honour `disabledActions`, because "approve
// is refused until confirmed" is the behaviour under test.
vi.mock('../ActionBar', () => ({
  ActionBar: ({
    onAction,
    disabledActions = [],
  }: {
    onAction: (a: 'approve' | 'reject' | 'skip' | 'flag') => void;
    disabledActions?: ReadonlyArray<string>;
  }) => (
    <div>
      <button
        type="button"
        disabled={disabledActions.includes('approve')}
        onClick={() => onAction('approve')}
      >
        Approve
      </button>
      <button
        type="button"
        disabled={disabledActions.includes('reject')}
        onClick={() => onAction('reject')}
      >
        Reject
      </button>
    </div>
  ),
}));

import { TriageDetailPanel } from '../TriageDetailPanel';

const gatedItem = {
  id: 'q1',
  queue_type: 'quality-city',
  content_type: 'cities',
  title: 'Kabul — safety_notes',
  subtitle: 'composer:derived',
  confidence_score: 1,
  created_at: '2026-06-07T00:00:00Z',
  source: 'city-truth-engine',
  reporter_id: null,
  has_diff: false,
  meta: { field: 'safety_notes' },
  risk_flags: { safety: true, confirm_may_be_required: true },
} as never;

const plainItem = {
  ...(gatedItem as unknown as Record<string, unknown>),
  id: 'q2',
  title: 'Berlin — editorial_hook',
  meta: { field: 'editorial_hook' },
  risk_flags: {},
} as never;

beforeEach(() => {
  useEntityDataMock.mockReset();
  useStagingDataMock.mockReset();
  useEntityDataMock.mockReturnValue({ data: { name: 'Kabul' }, isLoading: false });
  useStagingDataMock.mockReturnValue({ data: null });
});

describe('TriageDetailPanel — outing-safety confirm', () => {
  it('refuses approve on a risk-gated row until the box is ticked', () => {
    render(<TriageDetailPanel item={gatedItem} onAction={vi.fn()} isActionLoading={false} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('leaves reject available — "do not publish this" must be the easy answer', () => {
    render(<TriageDetailPanel item={gatedItem} onAction={vi.fn()} isActionLoading={false} />);
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('sends confirm=true once a human ticks the box', () => {
    const onAction = vi.fn();
    render(<TriageDetailPanel item={gatedItem} onAction={onAction} isActionLoading={false} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    // (action, notes, cannedSlug, payload, confirm)
    expect(onAction.mock.calls[0][4]).toBe(true);
  });

  it('never attaches confirm to a rejection — it would record a claim nobody made', () => {
    const onAction = vi.fn();
    render(<TriageDetailPanel item={gatedItem} onAction={onAction} isActionLoading={false} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(onAction.mock.calls[0][0]).toBe('reject');
    expect(onAction.mock.calls[0][4]).toBeUndefined();
  });

  it('does not gate, or send a flag for, a row that carries no risk', () => {
    const onAction = vi.fn();
    render(<TriageDetailPanel item={plainItem} onAction={onAction} isActionLoading={false} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeEnabled();

    fireEvent.click(approve);
    expect(onAction.mock.calls[0][4]).toBeUndefined();
  });

  it('names the actual risk rather than asking for a blank confirmation', () => {
    render(<TriageDetailPanel item={gatedItem} onAction={vi.fn()} isActionLoading={false} />);
    expect(screen.getByText(/criminalise LGBTQ\+ people/)).toBeInTheDocument();
  });
});
