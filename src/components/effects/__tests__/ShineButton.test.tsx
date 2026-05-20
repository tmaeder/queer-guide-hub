/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShineButton } from '../ShineButton';

describe('ShineButton', () => {
  it('renders children inside a button', () => {
    render(<ShineButton>Click</ShineButton>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it('forwards onClick and arbitrary props', () => {
    const onClick = vi.fn();
    render(<ShineButton onClick={onClick} data-testid="x">Hi</ShineButton>);
    fireEvent.click(screen.getByTestId('x'));
    expect(onClick).toHaveBeenCalled();
  });

  it('applies a custom className alongside the monochrome defaults', () => {
    // Post-gutting (2026-05-19) ShineButton no longer adds shine-on-hover;
    // the shimmer overlay was removed in favor of plain monochrome styling.
    render(<ShineButton className="extra">x</ShineButton>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('extra');
    expect(btn).toHaveClass('bg-foreground');
  });
});
