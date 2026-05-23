import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HoursEditor } from '../HoursEditor';
import type { FieldConfig } from '@/types/cms';

const FIELD: FieldConfig = { name: 'hours', label: 'Hours', type: 'json', group: 'details' };

describe('HoursEditor', () => {
  it('renders a row for each day', () => {
    render(
      <HoursEditor
        field={FIELD}
        initialValue={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saving={false}
      />,
    );
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('seeds inputs from initial value', () => {
    render(
      <HoursEditor
        field={FIELD}
        initialValue={{ monday: { open: '09:00', close: '17:00' } }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saving={false}
      />,
    );
    const monOpen = screen.getByLabelText('Mon open') as HTMLInputElement;
    const monClose = screen.getByLabelText('Mon close') as HTMLInputElement;
    expect(monOpen.value).toBe('09:00');
    expect(monClose.value).toBe('17:00');
  });

  it('strips empty days on save', () => {
    const onSave = vi.fn();
    render(
      <HoursEditor
        field={FIELD}
        initialValue={{ monday: { open: '09:00', close: '17:00' } }}
        onSave={onSave}
        onCancel={vi.fn()}
        saving={false}
      />,
    );
    // Confirm via the ✓ button (aria-label="Save")
    fireEvent.click(screen.getByLabelText('Save'));
    expect(onSave).toHaveBeenCalledWith({
      monday: { open: '09:00', close: '17:00' },
    });
  });
});
