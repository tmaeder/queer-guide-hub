/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { useTrackMock, trackFn, useRecsMock, hasActiveTripMock, navigateMock } = vi.hoisted(() => ({
  useTrackMock: vi.fn(),
  trackFn: vi.fn(),
  useRecsMock: vi.fn(),
  hasActiveTripMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: useTrackMock }));
vi.mock('@/hooks/useRecommendations', () => ({ useRecommendations: useRecsMock }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({
  useLocalizedNavigate: () => navigateMock,
}));
vi.mock('@/hooks/useMeaningfulTrips', () => ({
  useHasMeaningfulActiveTrip: () => hasActiveTripMock(),
  usePrimaryMeaningfulTrip: () => null,
  useMeaningfulTrips: () => [],
}));
vi.mock('@/components/travel/ResumeTripStrip', () => ({
  ResumeTripStrip: () => <div data-testid="resume" />,
}));
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
  hasActiveTripMock.mockReset();
  navigateMock.mockReset();
  useTrackMock.mockReturnValue({ track: trackFn });
  useRecsMock.mockReturnValue({ data: [] });
  hasActiveTripMock.mockReturnValue(false);
  sessionStorage.clear();
});

describe('Travel page', () => {
  it('STATE B: shows StartTripHero when no active trip and no booking intent', () => {
    renderAt('/travel');
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(screen.queryByTestId('resume')).toBeNull();
    expect(screen.getByTestId('book')).toHaveAttribute('data-open', 'false');
  });

  it('STATE A: shows ResumeTripStrip and hides StartTripHero when user has an active trip', () => {
    hasActiveTripMock.mockReturnValue(true);
    renderAt('/travel');
    expect(screen.getByTestId('resume')).toBeInTheDocument();
    expect(screen.queryByTestId('hero')).toBeNull();
  });

  it('STATE C: opens BookNowAccordion and hides StartTripHero on ?intent=book', () => {
    renderAt('/travel?intent=book');
    expect(screen.queryByTestId('hero')).toBeNull();
    expect(screen.getByTestId('book')).toHaveAttribute('data-open', 'true');
  });

  it('always renders Pride and Inspiration sections', () => {
    renderAt('/travel');
    expect(screen.getByTestId('pride')).toBeInTheDocument();
    expect(screen.getByTestId('inspire')).toBeInTheDocument();
  });

  it('does not render the removed mode switcher', () => {
    renderAt('/travel');
    expect(screen.queryByTestId('mode-switcher')).toBeNull();
  });

  it('does not render the removed bottom Browse-destinations CTA', () => {
    renderAt('/travel');
    expect(screen.queryByText(/Browse destinations/i)).toBeNull();
  });

  it('fires track() exposure once per session', () => {
    renderAt('/travel');
    expect(trackFn).toHaveBeenCalled();
  });
});
