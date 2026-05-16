/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmBulkActionDialog } from '../ConfirmBulkActionDialog';

describe('ConfirmBulkActionDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmBulkActionDialog open={false} action="activate" count={3} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('shows count + action in the prompt body', () => {
    render(
      <ConfirmBulkActionDialog open action="activate" count={3} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    // Body uses <strong>{action}</strong>; pick that to disambiguate from the
    // button label.
    expect(screen.getByText('activate', { selector: 'strong' })).toBeInTheDocument();
    // Both prompt + button include the count; the button label is what callers
    // typically click.
    expect(screen.getByRole('button', { name: /Activate 3 links/i })).toBeInTheDocument();
  });

  it('uses singular "link" for count=1', () => {
    render(
      <ConfirmBulkActionDialog open action="activate" count={1} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Activate 1 link\b/i })).toBeInTheDocument();
  });

  it('Cancel button calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmBulkActionDialog open action="activate" count={3} onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('Confirm button calls onConfirm; label includes action + count', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmBulkActionDialog open action="activate" count={3} onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    const confirmBtn = screen.getByRole('button', { name: /Activate 3 links/i });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("uses destructive variant for 'remove' action", () => {
    render(
      <ConfirmBulkActionDialog open action="remove" count={2} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const confirmBtn = screen.getByRole('button', { name: /Remove 2 links/i });
    // Variant maps to a className token; check that the button has it.
    expect(confirmBtn.className).toMatch(/destructive/);
  });
});
