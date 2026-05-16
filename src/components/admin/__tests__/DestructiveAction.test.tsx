/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DestructiveAction } from '../DestructiveAction';

describe('DestructiveAction', () => {
  it('renders trigger with the label', () => {
    render(<DestructiveAction label="Delete venue" description="x" onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Delete venue/i })).toBeInTheDocument();
  });

  it('opens dialog on trigger click and shows description', () => {
    render(
      <DestructiveAction
        label="Delete venue"
        description="This cannot be undone."
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete venue/i }));
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('invokes onConfirm when the confirm action is clicked', async () => {
    const onConfirm = vi.fn();
    render(<DestructiveAction label="Delete" description="x" onConfirm={onConfirm} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Delete/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });

  it('disables the trigger when disabled prop is set', () => {
    render(<DestructiveAction label="Delete" description="x" onConfirm={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: /Delete/i })).toBeDisabled();
  });

  it('honors custom confirmLabel/cancelLabel', () => {
    render(
      <DestructiveAction
        label="Remove"
        description="x"
        confirmLabel="Yes, remove"
        cancelLabel="No, keep"
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Remove/i }));
    expect(screen.getByRole('button', { name: /Yes, remove/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No, keep/i })).toBeInTheDocument();
  });
});
