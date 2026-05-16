/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/utils/timezone', () => ({ timeAgo: () => '1m ago' }));
vi.mock('../constants', () => ({
  kanbanColumns: [{ id: 'new', label: 'New' }, { id: 'resolved', label: 'Resolved' }],
  priorityFor: (n: number) => ({ short: `P${n}` }),
}));

import { ActivityLog } from '../ActivityLog';

const entries = [
  { id: 'a1', actor_id: 'u1', field: 'feedback_status', old_value: 'new', new_value: 'resolved', at: new Date().toISOString() },
  { id: 'a2', actor_id: null, field: 'priority', old_value: 2, new_value: 1, at: new Date().toISOString() },
] as never;

describe('ActivityLog', () => {
  it('renders nothing when no entries', () => {
    const { container } = render(<ActivityLog entries={[]} adminById={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows entry count in collapsed header', () => {
    render(<ActivityLog entries={entries} adminById={{ u1: { display_name: 'Alice' } } as never} />);
    expect(screen.getByText(/Activity \(2\)/)).toBeInTheDocument();
  });

  it('expands to show entries when clicked', () => {
    render(<ActivityLog entries={entries} adminById={{ u1: { display_name: 'Alice' } } as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Activity/i }));
    expect(screen.getByText(/Status: New → Resolved/)).toBeInTheDocument();
    expect(screen.getByText(/System/)).toBeInTheDocument();
  });
});
