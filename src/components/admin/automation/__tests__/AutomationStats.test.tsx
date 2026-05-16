/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutomationStats } from '../AutomationStats';

const baseStats = {
  pending_changes: 5,
  auto_approved_24h: 12,
  total_proposed_24h: 20,
  modules_enabled: 3,
  approval_rate: 0.6,
  last_run: null,
} as never;

describe('AutomationStats', () => {
  it('renders all 6 stat cards with labels', () => {
    render(<AutomationStats stats={baseStats} />);
    expect(screen.getByText(/Pending Review/i)).toBeInTheDocument();
    expect(screen.getByText(/Auto-Approved \(24h\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Proposed \(24h\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Modules Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Auto-Approval Rate/i)).toBeInTheDocument();
    expect(screen.getByText(/Last Run/i)).toBeInTheDocument();
  });

  it('formats approval_rate as percentage', () => {
    render(<AutomationStats stats={{ ...baseStats, approval_rate: 0.75 } as never} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it("shows 'Never' for last_run when null", () => {
    render(<AutomationStats stats={baseStats} />);
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('renders raw numeric values for unformatted keys', () => {
    render(<AutomationStats stats={baseStats} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('formats last_run as relative time when given a date', () => {
    const now = new Date(Date.now() - 60_000).toISOString();
    render(<AutomationStats stats={{ ...baseStats, last_run: now } as never} />);
    expect(screen.getByText(/ago/i)).toBeInTheDocument();
  });
});
