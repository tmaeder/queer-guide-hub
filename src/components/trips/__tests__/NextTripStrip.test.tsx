/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { navigateFn } = vi.hoisted(() => ({ navigateFn: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));
vi.mock('../tripPhase', () => ({
  getTripPhase: (trip: { _phase?: string }) => trip._phase ?? 'plan',
  phaseStatusText: () => 'in 5 days',
  daysFromToday: (start: string | null) => (start ? 5 : null),
}));
vi.mock('../tripTitle', () => ({ resolveTripTitle: (t: { title: string }) => t.title }));

import { NextTripStrip } from '../NextTripStrip';

beforeEach(() => navigateFn.mockReset());

describe('NextTripStrip', () => {
  it('renders nothing when no trips qualify (e.g. archived only)', () => {
    const { container } = render(
      <NextTripStrip trips={[{ id: 't1', title: 'X', _phase: 'memory', start_date: '2020-01-01' } as never]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders hero card with title + Open trip CTA', () => {
    render(
      <NextTripStrip
        trips={[
          { id: 't1', title: 'Berlin', _phase: 'plan', start_date: '2026-06-01', end_date: '2026-06-05', primary_city_name: 'Berlin', cover_image_url: null } as never,
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Berlin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open trip/i })).toBeInTheDocument();
  });

  it('navigates to /trips/<id> when Open trip clicked', () => {
    render(
      <NextTripStrip
        trips={[
          { id: 't1', title: 'X', _phase: 'plan', start_date: '2026-06-01', end_date: '2026-06-05', cover_image_url: null } as never,
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open trip/i }));
    expect(navigateFn).toHaveBeenCalledWith('/trips/t1');
  });

  it("shows Today's view button + Active-now badge for live trip", () => {
    render(
      <NextTripStrip
        trips={[
          { id: 't1', title: 'Live', _phase: 'live', start_date: '2026-05-15', end_date: '2026-05-20', cover_image_url: null } as never,
        ]}
      />,
    );
    expect(screen.getByText(/Active now/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Today’s view/i })).toBeInTheDocument();
  });

  it('renders cover image when provided', () => {
    const { container } = render(
      <NextTripStrip
        trips={[
          { id: 't1', title: 'X', _phase: 'plan', start_date: '2026-06-01', end_date: '2026-06-05', cover_image_url: 'https://img/a.jpg' } as never,
        ]}
      />,
    );
    const bg = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(bg.style.backgroundImage).toContain('https://img/a.jpg');
  });
});
