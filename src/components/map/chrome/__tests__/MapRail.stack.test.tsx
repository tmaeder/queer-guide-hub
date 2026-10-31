import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapRail } from '../MapRail';
import type { MapPointSummary } from '../../mapPoint';

// A real shape: one geocode carrying far more places than the old 30-card cap.
const points = Array.from(
  { length: 40 },
  (_, i) =>
    ({
      id: `venue-${i}`,
      type: 'venues',
      entity: 'venue',
      line: null,
      name: `Place ${i}`,
      lng: 13.405,
      lat: 52.52,
      color: 'hsl(0 0% 0%)',
      featured: false,
      live: false,
    }) as unknown as MapPointSummary,
);

const base = { onHover: vi.fn(), onSelect: vi.fn() };

describe('MapRail stack mode', () => {
  it('positive control: the in-view board still caps at 30 cards', () => {
    render(<MapRail {...base} points={points} />);
    expect(screen.getAllByRole('option')).toHaveLength(30);
    expect(screen.queryByRole('button', { name: /all places in view/i })).toBeNull();
  });

  it('lists every place at the spot, uncapped, and names the scope', () => {
    render(<MapRail {...base} points={points} stack={{ onClear: vi.fn() }} />);
    expect(screen.getAllByRole('option')).toHaveLength(40);
    expect(screen.getByRole('status')).toHaveTextContent(/places at this spot/i);
    expect(screen.getByRole('listbox', { name: /places at this spot/i })).toBeInTheDocument();
  });

  it('offers a way back to everything in view', () => {
    const onClear = vi.fn();
    render(<MapRail {...base} points={points} stack={{ onClear }} />);
    fireEvent.click(screen.getByRole('button', { name: /all places in view/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
