/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChangeDetailDialog } from '../ChangeDetailDialog';

const baseChange = {
  id: 'c1',
  content_type: 'venues',
  content_name: 'Pride Bar',
  field_name: 'description',
  confidence: 0.85,
  change_type: 'update',
  status: 'pending',
  old_value: 'old',
  new_value: 'new',
  reasoning: 'LLM said so',
} as never;

describe('ChangeDetailDialog', () => {
  it('renders nothing when no change', () => {
    render(<ChangeDetailDialog change={null} open onClose={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} onRevert={vi.fn()} />);
    expect(screen.queryByText(/Change Detail/)).toBeNull();
  });

  it('renders content + field + confidence + values', () => {
    render(<ChangeDetailDialog change={baseChange} open onClose={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} onRevert={vi.fn()} />);
    expect(screen.getByText('Pride Bar')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('old')).toBeInTheDocument();
    expect(screen.getByText('new')).toBeInTheDocument();
  });

  it('Approve + Reject buttons fire callbacks (pending)', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<ChangeDetailDialog change={baseChange} open onClose={vi.fn()} onApprove={onApprove} onReject={onReject} onRevert={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve & Apply/ }));
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }));
    expect(onApprove).toHaveBeenCalledWith('c1');
    expect(onReject).toHaveBeenCalledWith('c1');
  });

  it('Revert appears for applied status', () => {
    const onRevert = vi.fn();
    render(<ChangeDetailDialog change={{ ...baseChange, status: 'applied' } as never} open onClose={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} onRevert={onRevert} />);
    fireEvent.click(screen.getByRole('button', { name: /Revert/ }));
    expect(onRevert).toHaveBeenCalledWith('c1');
  });

  it('flag-only changes show Dismiss Flag instead of Approve', () => {
    render(<ChangeDetailDialog change={{ ...baseChange, change_type: 'flag' } as never} open onClose={vi.fn()} onApprove={vi.fn()} onReject={vi.fn()} onRevert={vi.fn()} />);
    expect(screen.getByText(/flag-only/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dismiss Flag/ })).toBeInTheDocument();
  });
});
