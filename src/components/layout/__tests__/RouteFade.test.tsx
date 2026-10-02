/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteFade } from '../RouteFade';
import { isRouteMotionAllowed, routeJourneyTrack } from '../routeJourney';

function NavigationHarness({ destination }: { destination: string }) {
  const navigate = useNavigate();
  return (
    <RouteFade>
      <button type="button" onClick={() => navigate(destination)}>
        Ride
      </button>
    </RouteFade>
  );
}

describe('RouteFade subway journey', () => {
  afterEach(() => vi.useRealTimers());

  it('maps route families to their semantic line colour', () => {
    expect(routeJourneyTrack('/venues')).toBe('pink');
    expect(routeJourneyTrack('/de/cities/berlin')).toBe('blue');
    expect(routeJourneyTrack('/community')).toBe('green');
    expect(routeJourneyTrack('/news')).toBe('yellow');
  });

  it('keeps admin and safety routes motion-free', () => {
    expect(isRouteMotionAllowed('/admin')).toBe(false);
    expect(isRouteMotionAllowed('/help')).toBe(false);
    expect(isRouteMotionAllowed('/rights/trans')).toBe(false);
    expect(isRouteMotionAllowed('/events')).toBe(true);
  });

  it('draws one 620ms station journey for a route change', () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/venues']}>
        <NavigationHarness destination="/community" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ride' }));
    expect(screen.getByTestId('route-journey')).toHaveClass('route-journey--green');
    act(() => void vi.advanceTimersByTime(619));
    expect(screen.getByTestId('route-journey')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('route-journey')).not.toBeInTheDocument();
  });

  it('does not animate a transition into a crisis surface', () => {
    render(
      <MemoryRouter initialEntries={['/venues']}>
        <NavigationHarness destination="/help" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ride' }));
    expect(screen.queryByTestId('route-journey')).not.toBeInTheDocument();
  });
});
