/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { useTrackMock, trackFn, useRecsMock } = vi.hoisted(() => ({
  useTrackMock: vi.fn(),
  trackFn: vi.fn(),
  useRecsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: useTrackMock }));
vi.mock('@/hooks/useRecommendations', () => ({ useRecommendations: useRecsMock }));
vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({
    activeTrip: null,
    setActiveTripId: vi.fn(),
    dismiss: vi.fn(),
    undismiss: vi.fn(),
    isDismissed: false,
    candidateTrips: [],
  }),
}));
vi.mock('@/components/travel/TravelModeSwitcher', () => ({
  TravelModeSwitcher: () => <div data-testid="mode-switcher" />,
}));
vi.mock('@/components/travel/ResumeTripStrip', () => ({ ResumeTripStrip: () => <div data-testid="resume" /> }));
vi.mock('@/components/travel/StartTripHero', () => ({ StartTripHero: () => <div data-testid="hero" /> }));
vi.mock('@/components/travel/PrideScroller', () => ({ PrideScroller: () => <div data-testid="pride" /> }));
vi.mock('@/components/travel/InspirationGrid', () => ({ InspirationGrid: () => <div data-testid="inspire" /> }));
vi.mock('@/components/travel/BookNowAccordion', () => ({
  BookNowAccordion: (p: { defaultOpen: boolean }) => <div data-testid="book" data-open={String(p.defaultOpen)} />,
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import Travel from '../Travel';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/travel" element={<Travel />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useTrackMock.mockReset();
  trackFn.mockReset();
  useRecsMock.mockReset();
  useTrackMock.mockReturnValue({ track: trackFn });
  useRecsMock.mockReturnValue({ data: [] });
  sessionStorage.clear();
});

describe('Travel page', () => {
  it('renders all hero subsections by default', () => {
    renderAt('/travel');
    expect(screen.getByTestId('resume')).toBeInTheDocument();
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(screen.getByTestId('pride')).toBeInTheDocument();
    expect(screen.getByTestId('inspire')).toBeInTheDocument();
    expect(screen.getByTestId('book')).toHaveAttribute('data-open', 'false');
  });

  it('hides StartTripHero and opens BookNow when intent=book', () => {
    renderAt('/travel?intent=book');
    expect(screen.queryByTestId('hero')).toBeNull();
    expect(screen.getByTestId('book')).toHaveAttribute('data-open', 'true');
  });

  it('Browse destinations link points to /places', () => {
    renderAt('/travel');
    expect(screen.getByRole('link', { name: /Browse destinations/i })).toHaveAttribute('href', '/places');
  });

  it('fires track() exposure once per session', () => {
    renderAt('/travel');
    expect(trackFn).toHaveBeenCalled();
  });
});
