/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectEditor } from '../SelectEditor';

const field = {
  name: 'status',
  label: 'Status',
  type: 'select',
  options: [
    { value: 'active', label: 'Active' },
    { value: 'draft', label: 'Draft' },
  ],
} as const;

describe('SelectEditor', () => {
  it('cancels with one Escape while the select menu is open', () => {
    const onCancel = vi.fn();

    render(
      <SelectEditor
        field={field as never}
        initialValue="active"
        onSave={vi.fn()}
        onCancel={onCancel}
        saving={false}
      />,
    );

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('cancels with Escape from the select trigger after choosing a value', async () => {
    const onCancel = vi.fn();

    render(
      <SelectEditor
        field={field as never}
        initialValue="active"
        onSave={vi.fn()}
        onCancel={onCancel}
        saving={false}
      />,
    );

    fireEvent.keyDown(screen.getByRole('option', { name: 'Draft' }), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Status' }), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
