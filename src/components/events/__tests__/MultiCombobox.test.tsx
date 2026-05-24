/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiCombobox } from '../MultiCombobox';

const opts = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'g', label: 'Gamma' },
];

describe('MultiCombobox', () => {
  it('renders placeholder when nothing selected', () => {
    render(<MultiCombobox options={opts} selected={[]} onChange={vi.fn()} placeholder="Pick…" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick…');
  });

  it('renders badges for each selected value (≤ maxBadges)', () => {
    render(<MultiCombobox options={opts} selected={['a', 'b']} onChange={vi.fn()} maxBadges={3} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Alpha');
    expect(screen.getByRole('combobox')).toHaveTextContent('Beta');
  });

  it('collapses to "N selected" when over maxBadges', () => {
    render(<MultiCombobox options={opts} selected={['a', 'b', 'g']} onChange={vi.fn()} maxBadges={2} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('3 selected');
  });

  it('toggles a value when the inline remove icon is clicked', () => {
    const onChange = vi.fn();
    render(<MultiCombobox options={opts} selected={['a', 'b']} onChange={onChange} />);
    const removeBtns = screen.getAllByRole('button', { name: /Remove/i });
    fireEvent.click(removeBtns[0]);
    expect(onChange).toHaveBeenCalledWith(['b']);
  });
});
