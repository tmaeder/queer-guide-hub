/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DateTimeField } from '../DateTimeField';

const field = { name: 'when', label: 'When', type: 'datetime' } as never;

describe('DateTimeField', () => {
  it('renders', () => {
    render(<DateTimeField field={field} value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('When')).toBeInTheDocument();
  });
  it('parses ISO string', () => {
    render(<DateTimeField field={field} value="2026-05-15T12:00:00Z" onChange={vi.fn()} />);
    const input = screen.getByLabelText('When') as HTMLInputElement;
    expect(input.value).toMatch(/2026-05-15T\d{2}:\d{2}/);
  });
});
