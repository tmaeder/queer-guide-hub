/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useSummary = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useGovernanceRemediationSummary', () => ({
  useGovernanceRemediationSummary: useSummary,
}));

import { GovernanceRemediationPanel } from '../GovernanceRemediationPanel';

describe('GovernanceRemediationPanel', () => {
  it('shows immutable repaired, terminal, and open accounting', () => {
    useSummary.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        run: { status: 'completed', initial_items: 490_278 },
        by_engine: [
          { engine: 'events', resolution_state: 'resolved', items: 200 },
          { engine: 'venues', resolution_state: 'terminal', items: 490_078 },
        ],
        open_by_finding: [],
      },
    });

    render(<GovernanceRemediationPanel />);

    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.getByText('490,278')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getByText('490,078')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });
});
