/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BooleanField } from '../BooleanField';

const field = { name: 'enabled', label: 'Enabled', type: 'boolean' } as never;

describe('BooleanField', () => {
  it('renders with label', () => {
    render(<BooleanField field={field} value={false} onChange={vi.fn()} />);
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });
  it('reflects truthy value', () => {
    render(<BooleanField field={field} value={true} onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });
});
