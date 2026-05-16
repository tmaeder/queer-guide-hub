/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HOTEL_VIBES } from '../hotelVibes';
import { VibeChipsRow } from '../VibeChipsRow';

describe('VibeChipsRow', () => {
  it('renders one button per HOTEL_VIBES entry', () => {
    render(<VibeChipsRow active={null} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(HOTEL_VIBES.length);
  });

  it('marks the active chip with aria-pressed=true', () => {
    render(<VibeChipsRow active={HOTEL_VIBES[0].slug} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: HOTEL_VIBES[0].label })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking inactive chip calls onChange with its slug', () => {
    const onChange = vi.fn();
    render(<VibeChipsRow active={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: HOTEL_VIBES[0].label }));
    expect(onChange).toHaveBeenCalledWith(HOTEL_VIBES[0].slug);
  });

  it('clicking active chip again calls onChange(null)', () => {
    const onChange = vi.fn();
    render(<VibeChipsRow active={HOTEL_VIBES[0].slug} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: HOTEL_VIBES[0].label }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
