/**
 * @vitest-environment jsdom
 *
 * THE KEYBOARD MUST NOT DO WHAT THE MOUSE REFUSES.
 *
 * `useTriageKeyboard` was wired straight to `TriageView.handleAction`, while every
 * gate lived one layer below in `TriageDetailPanel.handleAction`. The mouse passed
 * through the gates because the button was inside the panel. The keyboard originated
 * above them. Measured consequences, all three:
 *
 *   a) `a` on a namesake personality pair MERGED IT — past the panel's disabled
 *      button, past `runBulk`'s guard, and past `approve_dedup_review_batch`'s own
 *      WHERE. Three layers of defence and one unguarded door, and it is the shortcut
 *      the empty state teaches first.
 *   b) `a` on a risk-gated row sent no `p_confirm`, so `approve_entity_review` raised
 *      42501 and the reviewer got a raw Postgres string as a red toast — on the 347
 *      highest-stakes rows in the queue.
 *   c) `keep_id` was never sent, so a canonical flip the reviewer made was discarded.
 *
 * These assert the WIRING. `resolveDecision.test.ts` asserts the rules. A correct
 * rule nobody consults is exactly the state this replaced, so both halves are needed.
 *
 * The real `useTriageKeyboard` runs here deliberately — mocking it would test a copy
 * of the wiring rather than the wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mutate = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();

const ITEMS = [
  {
    id: 'person-pair',
    queue_type: 'dedup-review',
    content_type: 'personality',
    title: 'Søren Dahl ⇄ Soren Dahl',
    subtitle: 'despace_namesake',
    status: 'open',
    confidence_score: 0.75,
    created_at: '2026-09-01T00:00:00Z',
    source: 'sweep',
    entity_id: 'p1',
    entity_table: 'personalities',
    has_diff: false,
    reporter_id: null,
    meta: { keep_id: 'keep-1' },
    risk_flags: { namesake: true },
  },
  {
    id: 'city-note',
    queue_type: 'quality-city',
    content_type: 'city',
    title: 'Kabul — safety notes',
    subtitle: 'safety_notes',
    status: 'open',
    confidence_score: 0.95,
    created_at: '2026-09-01T00:00:00Z',
    source: 'composer',
    entity_id: 'c1',
    entity_table: 'cities',
    has_diff: false,
    reporter_id: null,
    meta: {},
    risk_flags: { confirm_may_be_required: true },
  },
  {
    id: 'venue-pair',
    queue_type: 'dedup-review',
    content_type: 'venue',
    title: 'The Garage ⇄ The Garage',
    subtitle: 'same_street_address',
    status: 'open',
    confidence_score: 0.97,
    created_at: '2026-09-01T00:00:00Z',
    source: 'sweep',
    entity_id: 'v1',
    entity_table: 'venues',
    has_diff: false,
    reporter_id: null,
    meta: { keep_id: 'keep-1' },
    risk_flags: {},
  },
];

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: (...a: unknown[]) => toastError(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    message: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useUnifiedTriageQueue', () => ({
  useUnifiedTriageQueue: () => ({
    data: { items: ITEMS, total: ITEMS.length },
    isLoading: false,
    error: null,
  }),
  useTriageAction: () => ({ mutate, mutateAsync: vi.fn(), isPending: false }),
  useHighConfCount: () => ({ data: 0, refetch: vi.fn() }),
  useBulkApproveHighConf: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useReviewCounts', () => ({ useReviewCounts: () => ({ data: {} }) }));
vi.mock('@/hooks/useTriageSourceCapabilities', () => ({
  useTriageSourceCapabilities: () => ({ externalConsoleFor: () => null, loading: false }),
}));
vi.mock('@/hooks/useReviewQueueCohorts', () => ({
  useReviewQueueCohorts: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/components/admin/review/ReviewBulkBar', () => ({ ReviewBulkBar: () => null }));
vi.mock('../TriageFilterBar', () => ({ TriageFilterBar: () => null }));

// Selecting an item is the precondition for every case here, so the list is a
// stub that exposes the real `onSelect`.
vi.mock('../TriageList', () => ({
  TriageList: ({
    items,
    onSelect,
  }: {
    items: { id: string }[];
    onSelect: (id: string) => void;
  }) => (
    <div>
      {items.map((i) => (
        <button key={i.id} onClick={() => onSelect(i.id)}>
          select {i.id}
        </button>
      ))}
    </div>
  ),
}));

// The panel is now CONTROLLED: it reports the reviewer's answers up and asks for
// an action. The stub exercises exactly that contract, so these tests drive
// TriageView's own resolution rather than a copy of it.
vi.mock('../TriageDetailPanel', () => ({
  TriageDetailPanel: ({
    onAnswersChange,
  }: {
    onAnswersChange: (patch: Record<string, unknown>) => void;
  }) => (
    <div>
      <button onClick={() => onAnswersChange({ namesakeConfirmed: true })}>confirm namesake</button>
      <button onClick={() => onAnswersChange({ safetyConfirmed: true })}>confirm safety</button>
      <button onClick={() => onAnswersChange({ keepId: 'keep-2' })}>flip canonical</button>
      <button onClick={() => onAnswersChange({ notes: 'wrong person' })}>type a note</button>
    </div>
  ),
}));

import { TriageView } from '../TriageView';

/** The active element must not be an input, or useListKeyboard correctly bails. */
async function press(user: ReturnType<typeof userEvent.setup>, key: string) {
  (document.activeElement as HTMLElement | null)?.blur();
  await user.keyboard(key);
}

beforeEach(() => {
  mutate.mockClear();
  toastError.mockClear();
  toastWarning.mockClear();
});

describe('`a` respects the namesake gate', () => {
  it('does NOT merge an unconfirmed namesake pair', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select person-pair'));
    await press(user, 'a');

    // The defect: this merged two different people.
    expect(mutate).not.toHaveBeenCalled();
  });

  it('explains the refusal instead of failing silently', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select person-pair'));
    await press(user, 'a');

    // A shortcut that does nothing reads as a broken keyboard, which is how a
    // reviewer learns to stop using it.
    await waitFor(() => expect(toastWarning).toHaveBeenCalled());
    expect(JSON.stringify(toastWarning.mock.calls)).toMatch(/same person/i);
  });

  it('merges once the reviewer has confirmed', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select person-pair'));
    await user.click(screen.getByText('confirm namesake'));
    await press(user, 'a');

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0]).toMatchObject({ itemId: 'person-pair', action: 'approve' });
  });

  it('still lets `r` reject an unconfirmed pair', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select person-pair'));
    await press(user, 'r');

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0]).toMatchObject({ action: 'reject' });
  });
});

describe('`a` carries the outing-safety confirmation', () => {
  it('does NOT send an unconfirmed gated row to a 42501', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select city-note'));
    await press(user, 'a');

    expect(mutate).not.toHaveBeenCalled();
    await waitFor(() => expect(toastWarning).toHaveBeenCalled());
  });

  it('sends confirm: true once the box is ticked', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select city-note'));
    await user.click(screen.getByText('confirm safety'));
    await press(user, 'a');

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0]).toMatchObject({ itemId: 'city-note', confirm: true });
  });
});

describe('`a` carries the canonical flip', () => {
  it('sends keep_id after the reviewer picked the other row', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select venue-pair'));
    await user.click(screen.getByText('flip canonical'));
    await press(user, 'a');

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    // The defect: the flip was reachable from SQL, from the hook, and from the
    // panel — and the keyboard threw it away.
    expect(mutate.mock.calls[0][0]).toMatchObject({ payload: { keep_id: 'keep-2' } });
  });
});

describe('notes belong to the item they were typed on', () => {
  it('`r` sends the note the reviewer typed', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select venue-pair'));
    await user.click(screen.getByText('type a note'));
    await press(user, 'r');

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    // The defect: the keyboard path passed no notes argument at all, so the
    // rejection was recorded with no reason AND the text stayed in the box.
    expect(mutate.mock.calls[0][0]).toMatchObject({ notes: 'wrong person' });
  });

  it('does not carry a note onto the next item', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select venue-pair'));
    await user.click(screen.getByText('type a note'));
    await user.click(screen.getByText('select city-note'));
    await user.click(screen.getByText('confirm safety'));
    await press(user, 'a');

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    // Answers are keyed by item id, so a leak is impossible by construction
    // rather than by remembering a `key` prop.
    expect(mutate.mock.calls[0][0].notes).toBeUndefined();
  });

  it('does not carry a safety confirmation onto the next item', async () => {
    const user = userEvent.setup();
    render(<TriageView />);
    await user.click(screen.getByText('select city-note'));
    await user.click(screen.getByText('confirm safety'));
    // A confirmation that survived the advance would already be satisfied for a
    // row nobody read — the highest-stakes version of the same leak.
    await user.click(screen.getByText('select person-pair'));
    await press(user, 'a');

    expect(mutate).not.toHaveBeenCalled();
  });
});
