/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextAreaField } from '../TextAreaField';

const field = { name: 'body', label: 'Body', type: 'textarea' } as never;

describe('TextAreaField', () => {
  it('renders textarea', () => {
    render(<TextAreaField field={field} value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
  });
  it('calls onChange', () => {
    const onChange = vi.fn();
    render(<TextAreaField field={field} value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'hi' } });
    expect(onChange).toHaveBeenCalledWith('hi');
  });
  it('shows char count when maxLength set', () => {
    const f = { ...field, maxLength: 100 } as never;
    render(<TextAreaField field={f} value="abc" onChange={vi.fn()} />);
    expect(screen.getByText('3/100')).toBeInTheDocument();
  });
});
