/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useWorkflowMonitor', () => ({
  useWorkflowMonitor: () => ({
    definitions: [], runs: [], activeRuns: [], deadLetterRuns: [],
    stats: { totalRuns: 0, runningRuns: 0, failedRuns: 0, deadLetterRuns: 0, completedRuns: 0 },
    metrics: { totalRuns: 0, successRate: 0, avgDurationMs: 0, p95DurationMs: 0 }, isLoading: false, metricsLoading: false,
    enqueueWorkflow: vi.fn(), retryRun: vi.fn(), cancelRun: vi.fn(),
    dispatchNow: vi.fn(), refetchMetrics: vi.fn(),
    isEnqueuing: false, isDispatching: false,
  }),
}));

import { WorkflowDashboard } from '../WorkflowDashboard';

function wrapper({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('WorkflowDashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<WorkflowDashboard />, { wrapper });
    expect(container).toBeTruthy();
  });
});
