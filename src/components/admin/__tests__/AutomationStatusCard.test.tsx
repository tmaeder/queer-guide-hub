import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutomationStatusCard } from '../AutomationStatusCard';
import type { ReviewAutomationStatus } from '@/hooks/useReviewAutomationStatus';

const useReviewAutomationStatus = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useReviewAutomationStatus', () => ({ useReviewAutomationStatus }));

const FULL: ReviewAutomationStatus = {
  review_queue: { open: 3997, auto_applies: 1192, auto_closes: 217, needs_human: 2588 },
  staging: { pending: 1319, auto_reconciles: 575, needs_human: 744 },
  dedup: { open: 1378 },
  jobs: {
    staging_reconcile_committed: { enabled: true, schedule: '25 6 * * *' },
    review_queue_autoapprove: { enabled: true, schedule: '50 6 * * *' },
    review_queue_close_unactionable: { enabled: true, schedule: '35 6 * * *' },
    dedup_close_distinct: { enabled: true, schedule: '20 6 * * *' },
  },
  generated_at: '2026-09-14T12:00:00Z',
};

beforeEach(() => {
  useReviewAutomationStatus.mockReset();
});

describe('AutomationStatusCard', () => {
  it('splits machine work from human work', () => {
    useReviewAutomationStatus.mockReturnValue({ data: FULL, isLoading: false, isError: false });
    render(<AutomationStatusCard />);
    // 1192 + 217 + 575
    expect(screen.getByText('1,984')).toBeInTheDocument();
    // 2588 + 744 + 1378
    expect(screen.getByText('4,710')).toBeInTheDocument();
    expect(screen.getByText('Cleared without you')).toBeInTheDocument();
    expect(screen.getByText('Actually needs you')).toBeInTheDocument();
  });

  it('renders nothing while loading rather than flashing zeroes', () => {
    useReviewAutomationStatus.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = render(<AutomationStatusCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says the status is unavailable instead of showing an empty queue', () => {
    // The load-bearing case: the RPC returns {} to a caller without the role,
    // and the hook maps that to null. Rendering zeroes there would read as
    // "nothing to do" — the absence-vs-clean confusion this codebase keeps
    // re-learning. It must say it could not look.
    useReviewAutomationStatus.mockReturnValue({ data: null, isLoading: false, isError: false });
    render(<AutomationStatusCard />);
    expect(screen.getByText(/not the same as an empty queue/i)).toBeInTheDocument();
    expect(screen.queryByText('Cleared without you')).not.toBeInTheDocument();
  });

  it('names a disabled job rather than silently promising a drain', () => {
    useReviewAutomationStatus.mockReturnValue({
      data: {
        ...FULL,
        jobs: {
          ...FULL.jobs,
          review_queue_autoapprove: { enabled: false, schedule: '50 6 * * *' },
        },
      },
      isLoading: false,
      isError: false,
    });
    render(<AutomationStatusCard />);
    expect(screen.getByText(/Auto-approve — disabled/)).toBeInTheDocument();
  });

  it('names a job that is not deployed at all', () => {
    // A job absent from the registry and a job that ran and found nothing both
    // produce no rows; only this distinguishes them.
    const { review_queue_autoapprove: _omitted, ...rest } = FULL.jobs;
    useReviewAutomationStatus.mockReturnValue({
      data: { ...FULL, jobs: rest },
      isLoading: false,
      isError: false,
    });
    render(<AutomationStatusCard />);
    expect(screen.getByText(/Auto-approve — not deployed/)).toBeInTheDocument();
  });

  it('stays quiet when every job is running', () => {
    useReviewAutomationStatus.mockReturnValue({ data: FULL, isLoading: false, isError: false });
    render(<AutomationStatusCard />);
    expect(screen.queryByText(/Not running/i)).not.toBeInTheDocument();
  });
});
