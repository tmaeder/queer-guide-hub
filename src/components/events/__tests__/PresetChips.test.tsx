/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => (typeof d === 'string' ? d : _k) }),
}));

import { PresetChips, getPresetDateRange } from '../PresetChips';

describe('PresetChips', () => {
  it('renders all six chips with role=tab', () => {
    render(<PresetChips active={null} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(6);
  });

  it('marks the active chip aria-selected', () => {
    render(<PresetChips active="featured" onSelect={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /Featured/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onSelect with id when inactive chip clicked', () => {
    const onSelect = vi.fn();
    render(<PresetChips active={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('tab', { name: /Free/i }));
    expect(onSelect).toHaveBeenCalledWith('free');
  });

  it('calls onSelect(null) when the active chip is clicked again', () => {
    const onSelect = vi.fn();
    render(<PresetChips active="free" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('tab', { name: /Free/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('disables chips listed in disabled prop', () => {
    render(<PresetChips active={null} onSelect={vi.fn()} disabled={['featured']} />);
    expect(screen.getByRole('tab', { name: /Featured/i })).toBeDisabled();
  });
});

describe('getPresetDateRange', () => {
  it('returns null for chips with no date range', () => {
    expect(getPresetDateRange('near-me')).toBeNull();
    expect(getPresetDateRange('free')).toBeNull();
    expect(getPresetDateRange('featured')).toBeNull();
  });

  it('returns a Friday–Sunday range for this-weekend', () => {
    const r = getPresetDateRange('this-weekend')!;
    expect(r.start.getDay()).toBe(5);
    expect(r.end.getDay()).toBe(0);
  });

  it('returns a range from today to month-end for this-month', () => {
    const r = getPresetDateRange('this-month')!;
    const lastOfMonth = new Date(r.start.getFullYear(), r.start.getMonth() + 1, 0).getDate();
    expect(r.end.getDate()).toBe(lastOfMonth);
  });

  it('returns June-July (Pride season)', () => {
    const r = getPresetDateRange('pride')!;
    expect(r.end.getMonth()).toBe(6);
    expect(r.end.getDate()).toBe(31);
  });
});
