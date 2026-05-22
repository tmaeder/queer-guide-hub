/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HOTEL_VIBES } from '../hotelVibes';
import { VibeChipsRow } from '../VibeChipsRow';

vi.mock('@/hooks/useHotelVibeCounts', () => ({
  // beach=5, all others=0 — only "Beach" chip should render.
  useHotelVibeCounts: () => ({
    data: Object.fromEntries(HOTEL_VIBES.map((v) => [v.slug, v.slug === 'beach' ? 5 : 0])),
  }),
}));

function wrap(node: React.ReactNode) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('VibeChipsRow zero-count filtering', () => {
  it('hides chips whose tag usage_count is 0', () => {
    wrap(<VibeChipsRow active={null} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent(/beach/i);
  });

  it('keeps the active chip visible even with zero count', () => {
    wrap(<VibeChipsRow active="design" onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.some((b) => /design/i.test(b.textContent ?? ''))).toBe(true);
  });
});
