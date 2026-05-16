/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/utils/timezone', () => ({ timeAgo: () => '2h ago' }));
vi.mock('../constants', () => ({
  kanbanColumns: [{ id: 'new', label: 'New', color: '#000' }, { id: 'resolved', label: 'Resolved', color: '#0f0' }],
  priorities: [
    { value: 1, short: 'P1', label: 'High', color: '#f00' },
    { value: 2, short: 'P2', label: 'Med', color: '#ff0' },
  ],
}));

import { DrawerTriageBar } from '../DrawerTriageBar';

const baseProps = {
  status: 'new',
  priority: 2,
  assigneeId: null,
  resolution: null,
  resolvedAt: null,
  admins: [{ user_id: 'u1', display_name: 'Alice', avatar_url: null }] as never,
  onStatusChange: vi.fn(),
  onPriorityChange: vi.fn(),
  onAssign: vi.fn(),
  onResolutionChange: vi.fn(),
};

describe('DrawerTriageBar', () => {
  it('renders all four sections', () => {
    render(<DrawerTriageBar {...baseProps} />);
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Assignee')).toBeInTheDocument();
    expect(screen.getByText(/Resolution/)).toBeInTheDocument();
  });

  it('shows resolvedAt suffix when resolution present', () => {
    render(<DrawerTriageBar {...baseProps} resolvedAt="2026-05-15T00:00:00Z" resolution="fixed" />);
    expect(screen.getByText(/2h ago/)).toBeInTheDocument();
  });

  it('shows assignee hint when assigneeId set', () => {
    render(<DrawerTriageBar {...baseProps} assigneeId="u1" />);
    expect(screen.getByText(/Assigned to Alice/)).toBeInTheDocument();
  });
});
