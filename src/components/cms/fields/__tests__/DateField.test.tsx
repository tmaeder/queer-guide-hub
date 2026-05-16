/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateField } from '../DateField';

const field = { name: 'start', label: 'Start', type: 'date' } as never;

describe('DateField', () => {
  it('renders with iso date', () => {
    render(<DateField field={field} value="2026-05-15" onChange={vi.fn()} />);
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-05-15');
  });
  it('extracts date from datetime', () => {
    render(<DateField field={field} value="2026-05-15T12:00:00Z" onChange={vi.fn()} />);
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-05-15');
  });
  it('clears to null on empty', () => {
    const onChange = vi.fn();
    render(<DateField field={field} value="2026-05-15" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
