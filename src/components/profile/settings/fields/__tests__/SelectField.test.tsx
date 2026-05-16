/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SelectField } from '../SelectField';

describe('SelectField', () => {
  it('renders label and trigger', () => {
    render(<SelectField id="x" label="Pick" value="" onChange={vi.fn()} options={[{ value: 'a', label: 'A' }]} />);
    expect(screen.getByText('Pick')).toBeInTheDocument();
  });
});
