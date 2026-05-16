/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JsonField } from '../JsonField';

const field = { name: 'meta', label: 'Meta', type: 'json' } as never;

describe('JsonField', () => {
  it('renders empty', () => {
    render(<JsonField field={field} value={null} onChange={vi.fn()} />);
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });
  it('formats object value', () => {
    render(<JsonField field={field} value={{ a: 1 }} onChange={vi.fn()} />);
    const ta = screen.getByLabelText('Meta') as HTMLTextAreaElement;
    expect(ta.value).toContain('"a"');
  });
});
