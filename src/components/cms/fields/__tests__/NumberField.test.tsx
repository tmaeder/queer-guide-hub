/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NumberField } from '../NumberField';

const field = { name: 'qty', label: 'Qty', type: 'number' } as never;

describe('NumberField', () => {
  it('renders', () => {
    render(<NumberField field={field} value={5} onChange={vi.fn()} />);
    expect((screen.getByLabelText('Qty') as HTMLInputElement).value).toBe('5');
  });
  it('parses to number', () => {
    const onChange = vi.fn();
    render(<NumberField field={field} value={0} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Qty'), { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith(42);
  });
  it('clears to null on empty', () => {
    const onChange = vi.fn();
    render(<NumberField field={field} value={5} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Qty'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
