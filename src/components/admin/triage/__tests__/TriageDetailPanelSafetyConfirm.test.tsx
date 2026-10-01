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
 * pin the half this component still owns: the gate is visible, and ticking the
 * box reports the answer that unlocks it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TriageAction } from '../resolveDecision';

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


// The registry read and the audit timeline both use TanStack Query, which needs
// a provider these tests deliberately do not mount. Mocked at the module
// boundary, the same way useTriageDetail already is.
vi.mock('@/hooks/useTriageSourceCapabilities', () => ({
  useTriageSourceCapabilities: () => ({
    // Mirrors the live triage_sources row: org-link-review is the one queue
    // carrying an external_console, because triage_action refuses it.
    byQueue: { 'org-link-review': { external_console: '/admin/governance?mode=engines' } },
    loading: false,
    externalConsoleFor: (q: string) =>
      q === 'org-link-review' ? '/admin/governance?mode=engines' : undefined,
  }),
}));
vi.mock('@/components/admin/audit/PipelineInspector', () => ({
  PipelineInspector: () => <div data-testid="pipeline-inspector" />,
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

/**
 * The panel is CONTROLLED since the decision resolver landed: it no longer computes
 * `confirm` itself, it reports the reviewer's answer up and `resolveDecision` turns
 * that into `p_confirm`. So this suite tests the half the panel still owns — the
 * VISIBLE gate, and that ticking the box actually reports the answer.
 *
 * The other half (an answer of `safetyConfirmed` becomes `confirm: true` on approve
 * and never on reject) moved to `resolveDecision.test.ts`, where it is also asserted
 * for the keyboard path that used to bypass this component entirely.
 */
function Harness({ item, onAction }: { item: never; onAction: (a: TriageAction) => void }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  return (
    <TriageDetailPanel
      item={item}
      answers={answers}
      onAnswersChange={(patch) => setAnswers((a) => ({ ...a, ...patch }))}
      onAction={onAction}
      isActionLoading={false}
    />
  );
}

describe('TriageDetailPanel — outing-safety confirm', () => {
  it('refuses approve on a risk-gated row until the box is ticked', () => {
    render(<Harness item={gatedItem} onAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('leaves reject available — "do not publish this" must be the easy answer', () => {
    render(<Harness item={gatedItem} onAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('reports the confirmation up, which is what unlocks approve', () => {
    const onAnswersChange = vi.fn();
    render(
      <TriageDetailPanel
        item={gatedItem}
        answers={{}}
        onAnswersChange={onAnswersChange}
        onAction={vi.fn()}
        isActionLoading={false}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    // If this stops firing, the resolver never sees a confirmation and every
    // risk-gated row becomes un-approvable again — silently.
    expect(onAnswersChange).toHaveBeenCalledWith({ safetyConfirmed: true });
  });

  it('enables approve once the answer comes back, and then asks for the action', () => {
    const onAction = vi.fn();
    render(<Harness item={gatedItem} onAction={onAction} />);

    fireEvent.click(screen.getByRole('checkbox'));
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeEnabled();

    fireEvent.click(approve);
    expect(onAction).toHaveBeenCalledWith('approve');
  });

  it('does not gate a row that carries no risk', () => {
    const onAction = vi.fn();
    render(<Harness item={plainItem} onAction={onAction} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeEnabled();

    fireEvent.click(approve);
    expect(onAction).toHaveBeenCalledWith('approve');
  });

  it('names the actual risk rather than asking for a blank confirmation', () => {
    render(<Harness item={gatedItem} onAction={vi.fn()} />);
    expect(screen.getByText(/criminalise LGBTQ\+ people/)).toBeInTheDocument();
  });
});
