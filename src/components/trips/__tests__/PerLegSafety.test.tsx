/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useReservationsMock, useTripSafetyMock, computeSegmentsMock } = vi.hoisted(() => ({
  useReservationsMock: vi.fn(),
  useTripSafetyMock: vi.fn(),
  computeSegmentsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, optsOrDefault?: string | Record<string, unknown>) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      const def = (optsOrDefault as { defaultValue?: string } | undefined)?.defaultValue ?? _k;
      return def;
    },
  }),
}));
vi.mock('@/hooks/useReservations', () => ({ useReservations: useReservationsMock }));
vi.mock('@/hooks/useTripSafety', () => ({ useTripSafety: useTripSafetyMock }));
vi.mock('@/utils/tripSegments', () => ({ computeTripSegments: computeSegmentsMock }));

import { PerLegSafety } from '../PerLegSafety';

beforeEach(() => {
  useReservationsMock.mockReset();
  useTripSafetyMock.mockReset();
  computeSegmentsMock.mockReset();
  useReservationsMock.mockReturnValue({ data: [] });
});

describe('PerLegSafety', () => {
  it('renders nothing when no segments', () => {
    computeSegmentsMock.mockReturnValue([]);
    useTripSafetyMock.mockReturnValue({ countries: [] });
    const { container } = render(<PerLegSafety tripId="t1" tripPlaces={[]} tripDays={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders score and country name per segment', () => {
    computeSegmentsMock.mockReturnValue([
      { country_id: 'de', start_date: '2026-06-01', end_date: '2026-06-05', stop_count: 2 },
    ]);
    useTripSafetyMock.mockReturnValue({
      countries: [{ id: 'de', name: 'Germany', equality_score: 80, deathPenalty: false, criminalized: false }],
    });
    render(<PerLegSafety tripId="t1" tripPlaces={[]} tripDays={[]} />);
    expect(screen.getByText('Germany')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText(/Strong legal protections/i)).toBeInTheDocument();
  });

  it('shows death-penalty badge when applicable', () => {
    computeSegmentsMock.mockReturnValue([
      { country_id: 'x', start_date: '2026-06-01', end_date: '2026-06-05', stop_count: 1 },
    ]);
    useTripSafetyMock.mockReturnValue({
      countries: [{ id: 'x', name: 'Unsafe', equality_score: 5, deathPenalty: true, criminalized: true }],
    });
    render(<PerLegSafety tripId="t1" tripPlaces={[]} tripDays={[]} />);
    expect(screen.getByText(/Death penalty/i)).toBeInTheDocument();
  });

  it('shows criminalized badge when not death penalty but criminalized', () => {
    computeSegmentsMock.mockReturnValue([
      { country_id: 'x', start_date: '2026-06-01', end_date: '2026-06-05', stop_count: 1 },
    ]);
    useTripSafetyMock.mockReturnValue({
      countries: [{ id: 'x', name: 'Hard', equality_score: 20, deathPenalty: false, criminalized: true }],
    });
    render(<PerLegSafety tripId="t1" tripPlaces={[]} tripDays={[]} />);
    expect(screen.getByText(/Same-sex acts criminalized/i)).toBeInTheDocument();
  });

  it('falls back to em-dash + Unknown country when no data', () => {
    computeSegmentsMock.mockReturnValue([
      { country_id: 'unknown', start_date: '2026-06-01', end_date: '2026-06-05', stop_count: 1 },
    ]);
    useTripSafetyMock.mockReturnValue({ countries: [] });
    render(<PerLegSafety tripId="t1" tripPlaces={[]} tripDays={[]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Unknown country/i)).toBeInTheDocument();
  });
});
