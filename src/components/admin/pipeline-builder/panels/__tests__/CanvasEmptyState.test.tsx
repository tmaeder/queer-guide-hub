/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CanvasEmptyState from '../CanvasEmptyState';

describe('CanvasEmptyState', () => {
  it('renders the three primary CTAs', () => {
    render(
      <CanvasEmptyState
        onOpenCommandPalette={vi.fn()}
        onOpenTemplateLibrary={vi.fn()}
        onImport={vi.fn()}
      />,
    );
    expect(screen.getByText(/Quick-add a node/i)).toBeInTheDocument();
    expect(screen.getByText(/Apply a template/i)).toBeInTheDocument();
    expect(screen.getByText(/Import from JSON/i)).toBeInTheDocument();
  });

  it('fires the matching handler for each button', () => {
    const onCmd = vi.fn();
    const onTpl = vi.fn();
    const onImp = vi.fn();
    render(
      <CanvasEmptyState onOpenCommandPalette={onCmd} onOpenTemplateLibrary={onTpl} onImport={onImp} />,
    );
    fireEvent.click(screen.getByText(/Quick-add a node/i).closest('button')!);
    fireEvent.click(screen.getByText(/Apply a template/i).closest('button')!);
    fireEvent.click(screen.getByText(/Import from JSON/i).closest('button')!);
    expect(onCmd).toHaveBeenCalledTimes(1);
    expect(onTpl).toHaveBeenCalledTimes(1);
    expect(onImp).toHaveBeenCalledTimes(1);
  });
});
