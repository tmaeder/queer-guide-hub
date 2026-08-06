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
  it('renders all eight chips with role=tab', () => {
    render(<PresetChips active={null} onSelect={vi.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(8);
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

  // The corpus holds ~253 future events, ~10 in the next seven days. "Tonight"
  // was a live, clickable promise that resolved to an empty grid for almost
  // every visitor — which reads as "the scene is dead" rather than "we have no
  // listings". These three assertions are the guard on that.
  it('shows the count on a chip when one is supplied', () => {
    render(<PresetChips active={null} onSelect={vi.fn()} counts={{ tonight: 3 }} />);
    expect(screen.getByRole('tab', { name: /Tonight/i })).toHaveTextContent('3');
  });

  it('disables a chip whose count is zero', () => {
    render(<PresetChips active={null} onSelect={vi.fn()} counts={{ tonight: 0 }} />);
    expect(screen.getByRole('tab', { name: /Tonight/i })).toBeDisabled();
  });

  it('does not disable a chip with no count supplied', () => {
    // Absent ≠ zero. A preset we cannot count (near-me, free) must stay usable.
    render(<PresetChips active={null} onSelect={vi.fn()} counts={{ tonight: 0 }} />);
    expect(screen.getByRole('tab', { name: /Near me/i })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: /Free/i })).not.toBeDisabled();
  });

  it('keeps a zero-count chip visible rather than hiding it', () => {
    // Hiding it would read as a missing feature; disabling it reads as thin data.
    render(<PresetChips active={null} onSelect={vi.fn()} counts={{ tonight: 0 }} />);
    expect(screen.getAllByRole('tab')).toHaveLength(8);
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

  it('returns roughly a 7-day forward range for next-7-days', () => {
    const r = getPresetDateRange('next-7-days')!;
    const days = (r.end.getTime() - r.start.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(7);
    expect(days).toBeLessThan(9);
  });

  it('returns evening-through-tomorrow-morning for tonight', () => {
    const r = getPresetDateRange('tonight')!;
    expect(r.end.getTime()).toBeGreaterThan(r.start.getTime());
    expect(r.end.getHours()).toBe(6);
  });

  it('returns June-July (Pride season)', () => {
    const r = getPresetDateRange('pride')!;
    expect(r.end.getMonth()).toBe(6);
    expect(r.end.getDate()).toBe(31);
  });
});
