/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldRenderer } from '../FieldRenderer';

describe('FieldRenderer', () => {
  it('renders TextField for type=text', () => {
    render(<FieldRenderer field={{ name: 'x', label: 'X', type: 'text' } as never} value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('X')).toBeInTheDocument();
  });
  it('renders BooleanField for type=boolean', () => {
    render(<FieldRenderer field={{ name: 'b', label: 'B', type: 'boolean' } as never} value={false} onChange={vi.fn()} />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });
  it('renders SelectField for type=select', () => {
    render(<FieldRenderer field={{ name: 's', label: 'S', type: 'select', options: [{ value: 'a', label: 'A' }] } as never} value="a" onChange={vi.fn()} />);
    expect(screen.getByLabelText('S')).toBeInTheDocument();
  });
});
