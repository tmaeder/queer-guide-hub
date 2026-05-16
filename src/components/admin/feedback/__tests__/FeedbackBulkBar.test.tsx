/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/icons/brand', () => ({ Github: () => <svg /> }));
vi.mock('../constants', () => ({
  kanbanColumns: [{ id: 'new', label: 'New' }],
  priorities: [{ value: 1, short: 'P1', label: 'High' }],
}));

import { FeedbackBulkBar } from '../FeedbackBulkBar';

const baseProps = {
  selectedCount: 3,
  totalCount: 10,
  onSelectAll: vi.fn(),
  onClear: vi.fn(),
  onSetStatus: vi.fn(),
  onSetPriority: vi.fn(),
  onAssign: vi.fn(),
  onAddLabel: vi.fn(),
  onForward: vi.fn(),
  admins: [],
};

describe('FeedbackBulkBar', () => {
  it('renders selection count', () => {
    render(<FeedbackBulkBar {...baseProps} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });
});
