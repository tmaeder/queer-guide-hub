/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const { useRunsMock } = vi.hoisted(() => ({ useRunsMock: vi.fn() }));

vi.mock('../../hooks/usePipelineHistory', () => ({
  usePipelineRunsForPipeline: useRunsMock,
}));

import RunHistorySidebar from '../RunHistorySidebar';

function wrap(ui: React.ReactNode) { return <TooltipProvider>{ui}</TooltipProvider>; }

beforeEach(() => useRunsMock.mockReset());

describe('RunHistorySidebar', () => {
  it('shows loading state', () => {
    useRunsMock.mockReturnValue({ data: [], isLoading: true });
    render(wrap(<RunHistorySidebar pipelineId="p1" activeRunId={null} onSelectRun={vi.fn()} />));
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('shows empty message when no runs', () => {
    useRunsMock.mockReturnValue({ data: [], isLoading: false });
    render(wrap(<RunHistorySidebar pipelineId="p1" activeRunId={null} onSelectRun={vi.fn()} />));
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
  });

  it('renders run rows + filter chips', () => {
    useRunsMock.mockReturnValue({
      data: [
        { id: 'r1', status: 'completed', items_total: 10, items_succeeded: 10, items_failed: 0, duration_ms: 1234, started_at: '2026-05-15T00:00:00Z', created_at: '2026-05-15T00:00:00Z', triggered_by: 'cron' },
      ],
      isLoading: false,
    });
    render(wrap(<RunHistorySidebar pipelineId="p1" activeRunId={null} onSelectRun={vi.fn()} />));
    expect(screen.getByText(/r1/)).toBeInTheDocument();
  });

  it('Run click fires onSelectRun', () => {
    useRunsMock.mockReturnValue({
      data: [{ id: 'r1', status: 'completed', items_total: 1, items_succeeded: 1, items_failed: 0, duration_ms: 100, started_at: '2026-05-15T00:00:00Z', created_at: '2026-05-15T00:00:00Z', triggered_by: 'cron' }],
      isLoading: false,
    });
    const onSelect = vi.fn();
    render(wrap(<RunHistorySidebar pipelineId="p1" activeRunId={null} onSelectRun={onSelect} />));
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.includes('cron'))!);
    expect(onSelect).toHaveBeenCalledWith('r1');
  });

  it('Collapse button hides body', () => {
    useRunsMock.mockReturnValue({ data: [], isLoading: false });
    render(wrap(<RunHistorySidebar pipelineId="p1" activeRunId={null} onSelectRun={vi.fn()} />));
    const collapseBtns = screen.getAllByRole('button');
    fireEvent.click(collapseBtns.find(b => b.querySelector('svg.lucide-chevron-right'))!);
    expect(screen.queryByText(/Run History/)).toBeNull();
  });
});
