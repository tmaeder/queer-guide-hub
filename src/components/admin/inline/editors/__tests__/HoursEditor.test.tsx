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

  it('seeds inputs from legacy shape {monday: {open, close}}', () => {
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

  it('seeds inputs from scraper shape {regular: [{day, open, close}]}', () => {
    render(
      <HoursEditor
        field={FIELD}
        initialValue={{
          display: 'Mon-Fri 9am-5pm',
          popular: [],
          regular: [
            { day: 1, open: '0900', close: '1700' },
            { day: 3, open: '10:00', close: '18:00' },
          ],
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saving={false}
      />,
    );
    expect((screen.getByLabelText('Mon open') as HTMLInputElement).value).toBe('09:00');
    expect((screen.getByLabelText('Mon close') as HTMLInputElement).value).toBe('17:00');
    expect((screen.getByLabelText('Wed open') as HTMLInputElement).value).toBe('10:00');
    expect((screen.getByLabelText('Wed close') as HTMLInputElement).value).toBe('18:00');
    // Untouched day stays empty
    expect((screen.getByLabelText('Tue open') as HTMLInputElement).value).toBe('');
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
    fireEvent.click(screen.getByLabelText('Save'));
    expect(onSave).toHaveBeenCalledWith({
      monday: { open: '09:00', close: '17:00' },
    });
  });

  it('preserves non-day scraper metadata on save (display/popular/open_now)', () => {
    const onSave = vi.fn();
    render(
      <HoursEditor
        field={FIELD}
        initialValue={{
          display: 'Mon-Fri 9am-5pm',
          popular: [{ day: 5, hour: 20 }],
          open_now: true,
          regular: [{ day: 1, open: '0900', close: '1700' }],
        }}
        onSave={onSave}
        onCancel={vi.fn()}
        saving={false}
      />,
    );
    fireEvent.click(screen.getByLabelText('Save'));
    // display + popular + open_now must survive; regular is rebuilt from the
    // per-day map (now in legacy shape).
    expect(onSave).toHaveBeenCalledWith({
      display: 'Mon-Fri 9am-5pm',
      popular: [{ day: 5, hour: 20 }],
      open_now: true,
      monday: { open: '09:00', close: '17:00' },
    });
  });
});
