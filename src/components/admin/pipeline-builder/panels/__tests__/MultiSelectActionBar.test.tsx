/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import MultiSelectActionBar from '../MultiSelectActionBar';

function withProvider(ui: React.ReactNode) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

describe('MultiSelectActionBar', () => {
  it('shows count', () => {
    render(withProvider(
      <MultiSelectActionBar
        count={3}
        onDeselect={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onLayoutSelected={vi.fn()}
        onSaveAsTemplate={vi.fn()}
      />,
    ));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('fires each handler', () => {
    const onDel = vi.fn();
    const onDup = vi.fn();
    const onLay = vi.fn();
    const onSave = vi.fn();
    const onDesel = vi.fn();
    render(withProvider(
      <MultiSelectActionBar
        count={2}
        onDeselect={onDesel}
        onDelete={onDel}
        onDuplicate={onDup}
        onLayoutSelected={onLay}
        onSaveAsTemplate={onSave}
      />,
    ));
    fireEvent.click(screen.getByRole('button', { name: /Duplicate/i }));
    fireEvent.click(screen.getByRole('button', { name: /Auto-arrange/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save as template/i }));
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));
    expect(onDup).toHaveBeenCalled();
    expect(onLay).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalled();
    expect(onDel).toHaveBeenCalled();
  });
});
