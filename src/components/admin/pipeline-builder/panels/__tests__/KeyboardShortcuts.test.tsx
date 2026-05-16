/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import KeyboardShortcuts from '../KeyboardShortcuts';

function wrap(ui: React.ReactNode) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

describe('KeyboardShortcuts', () => {
  it('renders trigger button', () => {
    render(wrap(<KeyboardShortcuts />));
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('opens dialog on trigger click', () => {
    render(wrap(<KeyboardShortcuts />));
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('heading', { name: /Keyboard Shortcuts/i })).toBeInTheDocument();
  });

  it('opens dialog on ? key + fires onTrigger', () => {
    const onTrigger = vi.fn();
    render(wrap(<KeyboardShortcuts onTrigger={onTrigger} />));
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('heading', { name: /Keyboard Shortcuts/i })).toBeInTheDocument();
    expect(onTrigger).toHaveBeenCalled();
  });

  it('renders all 4 categories', () => {
    render(wrap(<KeyboardShortcuts />));
    fireEvent.click(screen.getByRole('button'));
    ['Pipeline', 'Canvas', 'Add', 'Help'].forEach(cat => {
      expect(screen.getByText(cat)).toBeInTheDocument();
    });
  });
});
