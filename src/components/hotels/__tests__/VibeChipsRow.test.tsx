/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HOTEL_VIBES } from '../hotelVibes';
import { VibeChipsRow } from '../VibeChipsRow';

vi.mock('@/hooks/useHotelVibeCounts', () => ({
  // Default: all chips have a non-zero count.
  useHotelVibeCounts: () => ({
    data: Object.fromEntries(HOTEL_VIBES.map((v) => [v.slug, 10])),
  }),
}));

function wrap(node: React.ReactNode) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('VibeChipsRow', () => {
  it('renders one button per HOTEL_VIBES entry', () => {
    wrap(<VibeChipsRow active={null} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(HOTEL_VIBES.length);
  });

  it('marks the active chip with aria-pressed=true', () => {
    wrap(<VibeChipsRow active={HOTEL_VIBES[0].slug} onChange={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: HOTEL_VIBES[0].label }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking inactive chip calls onChange with its slug', () => {
    const onChange = vi.fn();
    wrap(<VibeChipsRow active={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: HOTEL_VIBES[0].label }));
    expect(onChange).toHaveBeenCalledWith(HOTEL_VIBES[0].slug);
  });

  it('clicking active chip again calls onChange(null)', () => {
    const onChange = vi.fn();
    wrap(<VibeChipsRow active={HOTEL_VIBES[0].slug} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: HOTEL_VIBES[0].label }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
