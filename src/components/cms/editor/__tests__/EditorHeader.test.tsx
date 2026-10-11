/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getContentType } from '@/config/contentTypeRegistry';
import type { EditorState } from '@/types/cms';
import { EditorHeader } from '../EditorHeader';

const state: EditorState = {
  contentType: 'cities',
  originalData: {},
  isLoading: false,
  activeGroup: 'basic',
  data: { name: 'Zurich', slug: 'zurich' },
  isDirty: true,
  isSaving: false,
  itemId: 'city-1',
  errors: {},
};

function mount(onSave = vi.fn(), onReset = vi.fn(), onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <TooltipProvider>
        <EditorHeader
          contentType={getContentType('cities')!}
          state={state}
          onSave={onSave}
          onReset={onReset}
          onClose={onClose}
        />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('EditorHeader', () => {
  it('keeps save visible while revealing supporting tools on demand', () => {
    const save = vi.fn();
    const reset = vi.fn();
    mount(save, reset);
    expect(screen.getByRole('heading', { name: 'Zurich' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Editor tools' }));
    expect(screen.getByRole('button', { name: 'Preview' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('preserves unsaved-change protection when closing', () => {
    const close = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount(vi.fn(), vi.fn(), close);
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(confirm).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
