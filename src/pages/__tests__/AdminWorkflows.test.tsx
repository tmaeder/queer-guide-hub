/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/admin/WorkflowDashboard', () => ({
  WorkflowDashboard: () => <div data-testid="wf" />,
}));

import AdminWorkflows from '../AdminWorkflows';

describe('AdminWorkflows', () => {
  it('renders WorkflowDashboard', () => {
    render(<AdminWorkflows />);
    expect(screen.getByTestId('wf')).toBeInTheDocument();
  });
});
