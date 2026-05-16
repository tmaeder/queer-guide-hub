/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Input } from '../input';

describe('Input', () => {
  it('renders', () => {
    const { container } = render(<Input placeholder="x" />);
    expect(container.querySelector('input')).toBeTruthy();
  });
  it('fires onChange', () => {
    const onChange = vi.fn();
    const { container } = render(<Input onChange={onChange} />);
    fireEvent.change(container.querySelector('input')!, { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalled();
  });
});
