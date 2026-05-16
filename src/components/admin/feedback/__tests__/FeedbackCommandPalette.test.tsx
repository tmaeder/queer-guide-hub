/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../constants', () => ({
  kanbanColumns: [{ id: 'new', label: 'New' }, { id: 'resolved', label: 'Resolved' }],
  priorities: [{ value: 1, short: 'P1', label: 'High' }],
}));

import { FeedbackCommandPalette } from '../FeedbackCommandPalette';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  selectedCount: 0,
  admins: [{ user_id: 'u1', display_name: 'Alice' }] as never,
  onJumpToColumn: vi.fn(),
  onSetPriority: vi.fn(),
  onAssign: vi.fn(),
  onForwardSelected: vi.fn(),
  onFocusSearch: vi.fn(),
  onOpenHelp: vi.fn(),
};

describe('FeedbackCommandPalette', () => {
  it('renders nothing when closed', () => {
    render(<FeedbackCommandPalette {...baseProps} open={false} />);
    expect(screen.queryByText(/Jump to column/)).toBeNull();
  });

  it('lists navigation items', () => {
    render(<FeedbackCommandPalette {...baseProps} />);
    expect(screen.getByText(/Jump to column — New/)).toBeInTheDocument();
    expect(screen.getByText(/Focus search/)).toBeInTheDocument();
    expect(screen.getByText(/Keyboard shortcuts/)).toBeInTheDocument();
  });

  it('Focus search item calls onFocusSearch + closes', () => {
    const onChange = vi.fn();
    const onFocus = vi.fn();
    render(<FeedbackCommandPalette {...baseProps} onOpenChange={onChange} onFocusSearch={onFocus} />);
    fireEvent.click(screen.getByText(/Focus search/));
    expect(onFocus).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('priority items disabled when selectedCount=0', () => {
    render(<FeedbackCommandPalette {...baseProps} />);
    expect(screen.getByText(/Set priority — P1/i).closest('[role="option"]')).toHaveAttribute('aria-disabled', 'true');
  });

  it('priority items enabled with selection', () => {
    render(<FeedbackCommandPalette {...baseProps} selectedCount={2} />);
    expect(screen.getByText(/Set priority — P1/i).closest('[role="option"]')).not.toHaveAttribute('aria-disabled', 'true');
  });
});
