/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Bulk approve must not merge namesake pairs.
 *
 * `TriageDetailPanel` gates approving a personality dedup pair behind an explicit
 * "same person" confirmation — merging two different people is an outing risk, and
 * `_personality_merge_core` repoints the relationship graph while DROPPING
 * self-loops and already-existing edges, which no undo rebuilds.
 *
 * That gate covered the one-at-a-time path only. Select-all → Approve went straight
 * to `triage_action`, which has no such check, so the button beside the gate
 * bypassed it for all 46 open personality pairs at once. `approve_dedup_review_batch`
 * refuses personalities in its own WHERE for the same reason, but the bulk path does
 * not route through that RPC.
 *
 * Asserted through the real handler rather than a extracted predicate: the defect was
 * that the bulk path never consulted the rule, so a test of the rule in isolation
 * would have passed throughout.
 */

const mutateAsync = vi.fn().mockResolvedValue(undefined);

const ITEMS = [
  {
    id: 'venue-pair',
    queue_type: 'dedup-review',
    content_type: 'venue',
    title: 'The Garage ⇄ The Garage',
    subtitle: 'cross_city_name_only',
    status: 'open',
    confidence_score: 0.7,
    created_at: '2026-09-01T00:00:00Z',
    source: 'sweep',
    entity_id: 'v1',
    entity_table: 'venues',
    has_diff: false,
    reporter_id: null,
    meta: {},
    flag_type: null,
    risk_flags: {},
  },
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
    meta: {},
    flag_type: null,
    risk_flags: { namesake: true },
  },
];

const toastSuccess = vi.fn();
const toastWarning = vi.fn();

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: vi.fn(),
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
  useTriageAction: () => ({ mutate: vi.fn(), mutateAsync, isPending: false }),
  useHighConfCount: () => ({ data: 0, refetch: vi.fn() }),
  useBulkApproveHighConf: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useReviewCounts', () => ({ useReviewCounts: () => ({ data: {} }) }));
vi.mock('../TriageFilterBar', () => ({ TriageFilterBar: () => null }));
vi.mock('../TriageList', () => ({ TriageList: () => null }));
vi.mock('../TriageDetailPanel', () => ({ TriageDetailPanel: () => null }));
vi.mock('../useTriageKeyboard', () => ({ useTriageKeyboard: () => undefined }));

// Expose the real bulk handlers as buttons so the test drives the component's own
// code path rather than a copy of it.
vi.mock('@/components/admin/review/ReviewBulkBar', () => ({
  ReviewBulkBar: ({
    onSelectAll,
    onBulkApprove,
    onBulkReject,
  }: {
    onSelectAll: () => void;
    onBulkApprove: () => void;
    onBulkReject: () => void;
  }) => (
    <div>
      <button onClick={onSelectAll}>select all</button>
      <button onClick={onBulkApprove}>bulk approve</button>
      <button onClick={onBulkReject}>bulk reject</button>
    </div>
  ),
}));

import { TriageView } from '../TriageView';

describe('bulk approve holds back namesake pairs', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    toastSuccess.mockClear();
    toastWarning.mockClear();
  });

  it('approves the venue pair and never the personality pair', async () => {
    const user = userEvent.setup();
    render(<TriageView />);

    await user.click(screen.getByText('select all'));
    await user.click(screen.getByText('bulk approve'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());

    const ids = mutateAsync.mock.calls.map((c) => (c[0] as { itemId: string }).itemId);
    expect(ids).toContain('venue-pair');
    // The whole point: selecting everything must not merge two different people.
    expect(ids).not.toContain('person-pair');
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('says what it held back rather than silently dropping it', async () => {
    const user = userEvent.setup();
    render(<TriageView />);

    await user.click(screen.getByText('select all'));
    await user.click(screen.getByText('bulk approve'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const said = JSON.stringify(toastSuccess.mock.calls);
    // A guard that drops rows without telling the reviewer reads as "approved
    // everything" — the same class as the Undo that reported success it had not had.
    expect(said).toMatch(/namesake/i);
  });

  it('still lets bulk REJECT clear namesake pairs', async () => {
    const user = userEvent.setup();
    render(<TriageView />);

    await user.click(screen.getByText('select all'));
    await user.click(screen.getByText('bulk reject'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const ids = mutateAsync.mock.calls.map((c) => (c[0] as { itemId: string }).itemId);
    // "These are two different people" must stay the EASY answer, or the flag
    // pushes reviewers toward approving to clear the queue.
    expect(ids).toContain('person-pair');
    expect(ids).toContain('venue-pair');
  });
});
