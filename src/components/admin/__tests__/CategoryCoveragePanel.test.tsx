import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { CategoryCoveragePanel } from '../CategoryCoveragePanel';

const mockUseCategoryCoverage = vi.fn();
vi.mock('@/hooks/useCategoryCoverage', () => ({
  useCategoryCoverage: () => mockUseCategoryCoverage(),
}));

const COVERAGE = {
  venues: {
    total: 23484,
    uncategorised: 11401,
    uncategorised_pct: 48.5,
    auto_applied: 3328,
    awaiting_review: 2559,
    no_signal: 8842,
    nonvenue_candidates: 1377,
    unexamined: 0,
  },
  events: {
    total: 39757,
    uncategorised: 8656,
    uncategorised_pct: 21.8,
    concert_bucket_remaining: 0,
    reclassified: 9351,
    unexamined_concert: 0,
  },
  last_runs: {
    venue_category_reclassify: { last_run_at: '2026-08-03T03:35:00Z', status: 'succeeded', enabled: true },
    event_type_reclassify: { last_run_at: '2026-08-03T03:45:00Z', status: 'succeeded', enabled: true },
  },
};

describe('CategoryCoveragePanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing until the health RPC resolves', () => {
    mockUseCategoryCoverage.mockReturnValue({ data: undefined });
    const { container } = renderWithProviders(<CategoryCoveragePanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows coverage for both browse axes', () => {
    mockUseCategoryCoverage.mockReturnValue({ data: COVERAGE });
    renderWithProviders(<CategoryCoveragePanel />);
    expect(screen.getByText('Category coverage')).toBeInTheDocument();
    expect(screen.getByText('23,484')).toBeInTheDocument();
    expect(screen.getByText('48.5%')).toBeInTheDocument();
    expect(screen.getByText('21.8%')).toBeInTheDocument();
  });

  it('warns when a backfill job is disabled — the failure mode that hid this for years', () => {
    mockUseCategoryCoverage.mockReturnValue({
      data: {
        ...COVERAGE,
        last_runs: {
          ...COVERAGE.last_runs,
          venue_category_reclassify: { last_run_at: null, status: null, enabled: false },
        },
      },
    });
    renderWithProviders(<CategoryCoveragePanel />);
    expect(screen.getByText(/Backfill job not running/)).toBeInTheDocument();
    expect(screen.getByText(/Venue category/)).toBeInTheDocument();
  });

  it('does not warn when every job is enabled and succeeding', () => {
    mockUseCategoryCoverage.mockReturnValue({ data: COVERAGE });
    renderWithProviders(<CategoryCoveragePanel />);
    expect(screen.queryByText(/Backfill job not running/)).not.toBeInTheDocument();
  });
});
