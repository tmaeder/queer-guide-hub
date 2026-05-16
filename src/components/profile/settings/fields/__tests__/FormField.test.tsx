/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormField } from '../FormField';

describe('FormField', () => {
  it('renders single-line input', () => {
    render(<FormField id="x" label="Name" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
  it('renders multiline textarea', () => {
    render(<FormField id="x" label="Bio" value="" onChange={vi.fn()} multiline />);
    expect((screen.getByLabelText('Bio') as HTMLElement).tagName).toBe('TEXTAREA');
  });
  it('fires onChange', () => {
    const onChange = vi.fn();
    render(<FormField id="x" label="N" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('N'), { target: { value: 'v' } });
    expect(onChange).toHaveBeenCalledWith('v');
  });
});
