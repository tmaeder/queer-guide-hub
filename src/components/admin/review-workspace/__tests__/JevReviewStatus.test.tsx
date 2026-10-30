import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.data }),
  useMutation: () => ({ isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
import { JevReviewStatus } from '../JevReviewStatus';

beforeEach(() => {
  state.data = { enabled: true, counts: { applied: 10, blocked: 100 }, jobs: [] };
});
it('shows charged plus reserved production usage and distinguishes budget deferral', () => {
  state.data.production_budget = {
    charged_nano_usd: 20e9,
    reserved_nano_usd: 5e9,
    cap_nano_usd: 25e9,
    deferred: true,
  };
  render(<JevReviewStatus />);
  expect(screen.getByText(/Shared production budget:/)).toHaveTextContent(
    '$25.00 / $25.00 this UTC month',
  );
  expect(screen.getByText(/Shared production budget:/)).toHaveTextContent(
    'processing deferred at the budget limit',
  );
});
it('shows the actual evidence blocker without promising an unchanged blocked item will retry', () => {
  state.data.jobs = [
    {
      status: 'blocked',
      attempts: 2,
      next_attempt_at: '2026-10-30T10:00:00Z',
      outcome: { blocker: 'missing_source_url' },
    },
  ];
  render(<JevReviewStatus caseId="case" />);
  expect(screen.getByText('missing source url')).toBeInTheDocument();
  expect(screen.getByText(/Waiting for new evidence/)).toBeInTheDocument();
  expect(screen.queryByText(/Next check:/)).not.toBeInTheDocument();
});
it('shows operational retry reasons and the scheduled retry time', () => {
  state.data.jobs = [
    {
      status: 'retry',
      attempts: 1,
      next_attempt_at: '2026-10-30T10:00:00Z',
      outcome: { retry: 'Jev budget deferred' },
    },
  ];
  render(<JevReviewStatus caseId="case" />);
  expect(screen.getByText('Jev budget deferred')).toBeInTheDocument();
  expect(screen.getByText(/Next check:/)).toBeInTheDocument();
});
