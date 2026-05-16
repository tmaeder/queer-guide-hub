/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../CannedResponsePicker', () => ({
  CannedResponsePicker: () => <div data-testid="canned" />,
}));

import { ActionBar } from '../ActionBar';

describe('ActionBar', () => {
  it('renders all four action buttons', () => {
    render(<ActionBar onAction={vi.fn()} isLoading={false} />);
    ['Approve', 'Reject', 'Skip', 'Flag'].forEach(l => {
      expect(screen.getByRole('button', { name: new RegExp(l) })).toBeInTheDocument();
    });
  });

  it('disables all buttons when loading', () => {
    render(<ActionBar onAction={vi.fn()} isLoading />);
    expect(screen.getByRole('button', { name: /Approve/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reject/ })).toBeDisabled();
  });

  it('fires onAction with approve + notes', () => {
    const onAction = vi.fn();
    render(<ActionBar onAction={onAction} isLoading={false} />);
    fireEvent.change(screen.getByPlaceholderText(/Review notes/), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    expect(onAction).toHaveBeenCalledWith('approve', 'ok', undefined);
  });

  it('fires onAction with reject', () => {
    const onAction = vi.fn();
    render(<ActionBar onAction={onAction} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Reject/ }));
    expect(onAction).toHaveBeenCalledWith('reject', undefined, undefined);
  });
});
