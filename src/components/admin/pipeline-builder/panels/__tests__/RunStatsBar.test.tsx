/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { usePipelineRunMock } = vi.hoisted(() => ({ usePipelineRunMock: vi.fn() }));

vi.mock('../../hooks/usePipelineHistory', () => ({ usePipelineRun: usePipelineRunMock }));

import RunStatsBar from '../RunStatsBar';

beforeEach(() => usePipelineRunMock.mockReset());

const baseRun = {
  id: 'run-abcd1234',
  status: 'completed',
  items_total: 100,
  items_succeeded: 95,
  items_failed: 5,
  started_at: new Date(Date.now() - 60_000).toISOString(),
  created_at: new Date().toISOString(),
  duration_ms: 12345,
  triggered_by: 'cron',
  pipeline_version: 3,
  error_message: null,
};

describe('RunStatsBar', () => {
  it('shows loading copy while fetching', () => {
    usePipelineRunMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<RunStatsBar runId="r1" onClose={vi.fn()} />);
    expect(screen.getByText(/Loading run details/i)).toBeInTheDocument();
  });

  it('renders nothing when no run data', () => {
    usePipelineRunMock.mockReturnValue({ data: null, isLoading: false });
    const { container } = render(<RunStatsBar runId="r1" onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders status + success rate', () => {
    usePipelineRunMock.mockReturnValue({ data: baseRun, isLoading: false });
    render(<RunStatsBar runId="r1" onClose={vi.fn()} />);
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText(/5 failed/)).toBeInTheDocument();
  });

  it('shows error message when set', () => {
    usePipelineRunMock.mockReturnValue({ data: { ...baseRun, error_message: 'rls denied' }, isLoading: false });
    render(<RunStatsBar runId="r1" onClose={vi.fn()} />);
    expect(screen.getByText(/rls denied/)).toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    usePipelineRunMock.mockReturnValue({ data: baseRun, isLoading: false });
    const onClose = vi.fn();
    render(<RunStatsBar runId="r1" onClose={onClose} />);
    fireEvent.click(screen.getByTitle('Return to latest'));
    expect(onClose).toHaveBeenCalled();
  });
});
