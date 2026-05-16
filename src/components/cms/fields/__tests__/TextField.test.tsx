/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextField } from '../TextField';

const field = { name: 'title', label: 'Title', type: 'text' } as never;

describe('TextField', () => {
  it('renders input', () => {
    render(<TextField field={field} value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });
  it('calls onChange on type', () => {
    const onChange = vi.fn();
    render(<TextField field={field} value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } });
    expect(onChange).toHaveBeenCalledWith('X');
  });
  it('prepends https:// on url blur', () => {
    const urlField = { ...field, type: 'url' } as never;
    const onChange = vi.fn();
    render(<TextField field={urlField} value="example.com" onChange={onChange} />);
    fireEvent.blur(screen.getByLabelText('Title'));
    expect(onChange).toHaveBeenCalledWith('https://example.com');
  });
});
