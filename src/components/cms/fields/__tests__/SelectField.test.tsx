/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectField } from '../SelectField';

const field = {
  name: 'cat', label: 'Category', type: 'select',
  options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
} as never;

describe('SelectField', () => {
  it('renders options', () => {
    render(<SelectField field={field} value="a" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
  it('calls onChange', () => {
    const onChange = vi.fn();
    render(<SelectField field={field} value="a" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
