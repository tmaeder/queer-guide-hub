/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/admin/automation/AutomationDashboard', () => ({
  AutomationDashboard: () => <div data-testid="dash" />,
}));

import AdminAutomation from '../AdminAutomation';

describe('AdminAutomation', () => {
  it('renders AutomationDashboard', () => {
    render(<AdminAutomation />);
    expect(screen.getByTestId('dash')).toBeInTheDocument();
  });
});
