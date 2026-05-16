/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAutomation', () => ({
  useAutomation: () => ({
    modules: [], runHistory: [], stats: { pending_changes: 0, auto_approved_24h: 0, total_proposed_24h: 0, modules_enabled: 0, approval_rate: 0, last_run: null },
    activeRun: null, isLoading: false, isRunning: false,
    runningModuleSlug: null, toggleModule: vi.fn(), runModule: vi.fn(),
    updateModuleSettings: vi.fn(),
  }),
}));
vi.mock('../../LinkHealthDashboard', () => ({ LinkHealthDashboard: () => null }));
vi.mock('../AutomationStats', () => ({ AutomationStats: () => <div data-testid="stats" /> }));
vi.mock('../ModuleCard', () => ({ ModuleCard: () => null }));
vi.mock('../RunHistoryTable', () => ({ RunHistoryTable: () => null }));
vi.mock('../ModuleSettingsDialog', () => ({ ModuleSettingsDialog: () => null }));

import { AutomationDashboard } from '../AutomationDashboard';

describe('AutomationDashboard', () => {
  it('renders tab navigation + stats', () => {
    render(<MemoryRouter><AutomationDashboard /></MemoryRouter>);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Link Health')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
