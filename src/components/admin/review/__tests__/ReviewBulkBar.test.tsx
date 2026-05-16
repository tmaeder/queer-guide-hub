/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewBulkBar } from '../ReviewBulkBar';

const baseProps = {
  selectedCount: 2,
  totalCount: 10,
  onSelectAll: vi.fn(),
  onClearSelection: vi.fn(),
  onBulkApprove: vi.fn(),
  onBulkReject: vi.fn(),
};

describe('ReviewBulkBar', () => {
  it('renders nothing when selectedCount=0', () => {
    const { container } = render(<ReviewBulkBar {...baseProps} selectedCount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows badge with selected count', () => {
    render(<ReviewBulkBar {...baseProps} />);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('shows Select all only when selectedCount < totalCount', () => {
    render(<ReviewBulkBar {...baseProps} />);
    expect(screen.getByRole('button', { name: /Select all \(10\)/i })).toBeInTheDocument();
  });

  it('hides Select all when all selected', () => {
    render(<ReviewBulkBar {...baseProps} selectedCount={10} totalCount={10} />);
    expect(screen.queryByRole('button', { name: /Select all/i })).toBeNull();
  });

  it('fires handlers on button clicks', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onClear = vi.fn();
    render(
      <ReviewBulkBar
        {...baseProps}
        onBulkApprove={onApprove}
        onBulkReject={onReject}
        onClearSelection={onClear}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /Reject/i }));
    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
    expect(onApprove).toHaveBeenCalled();
    expect(onReject).toHaveBeenCalled();
    expect(onClear).toHaveBeenCalled();
  });

  it('disables Approve/Reject while loading', () => {
    render(<ReviewBulkBar {...baseProps} loading />);
    expect(screen.getByRole('button', { name: /Approve/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reject/i })).toBeDisabled();
  });
});
