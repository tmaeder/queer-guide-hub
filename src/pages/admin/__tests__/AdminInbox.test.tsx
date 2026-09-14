/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const registerAction = vi.fn();

vi.mock('@/components/admin/triage/TriageView', () => ({
  TriageView: (p: { initialQueueType?: string }) => (
    <div data-testid="triage-view">{p.initialQueueType ?? 'none'}</div>
  ),
}));

// The status card fetches through react-query; these tests render without a
// QueryClientProvider on purpose (they are about routing and the header), so
// the hook is mocked rather than the page being wrapped. Same treatment
// useReviewQueueCohorts needed when the cohort bar landed in TriageView.
const useReviewAutomationStatus = vi.hoisted(() =>
  // Typed loosely on purpose: the default return is the loading shape, and
  // individual tests override it with a full payload. Inferring from the
  // default would pin `data` to undefined and reject those overrides.
  vi.fn<() => { data: unknown; isLoading: boolean; isError: boolean }>(() => ({
    data: undefined,
    isLoading: true,
    isError: false,
  })),
);
vi.mock('@/hooks/useReviewAutomationStatus', () => ({ useReviewAutomationStatus }));

vi.mock('@/components/admin/command-palette/useAdminCommandActions', () => ({
  useRegisterAdminCommandAction: (action: { id: string }) => registerAction(action),
}));

import AdminInbox from '../AdminInbox';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/inbox" element={<AdminInbox />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminInbox', () => {
  it('renders header + embeds TriageView without a queue by default', () => {
    renderAt('/admin/inbox');
    expect(screen.getByRole('heading', { name: /^Inbox$/i })).toBeTruthy();
    expect(screen.getByTestId('triage-view')).toHaveTextContent('none');
    expect(screen.getByText(/Sorted by priority/i)).toBeTruthy();
  });

  it('maps legacy ?tab=staging (from /admin/review deep links) to the staging queue', () => {
    renderAt('/admin/inbox?tab=staging');
    expect(screen.getByTestId('triage-view')).toHaveTextContent('staging');
  });

  it('queue param overrides tab', () => {
    renderAt('/admin/inbox?tab=staging&queue=duplicates');
    expect(screen.getByTestId('triage-view')).toHaveTextContent('duplicates');
  });

  it('registers the Open Automation Cmd-K action', () => {
    registerAction.mockReset();
    renderAt('/admin/inbox');
    const ids = registerAction.mock.calls.map((c) => c[0].id);
    expect(ids).toContain('inbox.automation');
  });

  it('sets the document title', () => {
    renderAt('/admin/inbox');
    expect(document.title).toMatch(/Inbox.*Admin.*Queer Guide/);
  });
});

describe('AdminInbox — automation status', () => {
  it('mounts the card, so the header number is read beside the machine/human split', () => {
    useReviewAutomationStatus.mockReturnValueOnce({
      data: {
        review_queue: { open: 3997, auto_applies: 1192, auto_closes: 217, needs_human: 2588 },
        staging: { pending: 1319, auto_reconciles: 575, needs_human: 744 },
        dedup: { open: 1378 },
        jobs: {},
        generated_at: '2026-09-14T12:00:00Z',
      },
      isLoading: false,
      isError: false,
    });
    renderAt('/admin/inbox');
    expect(screen.getByText('Cleared without you')).toBeInTheDocument();
  });
});
