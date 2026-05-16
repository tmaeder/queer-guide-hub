/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SwitchField } from '../SwitchField';

describe('SwitchField', () => {
  it('renders label and switch', () => {
    render(<SwitchField id="x" label="On" checked={false} onChange={vi.fn()} />);
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });
});
