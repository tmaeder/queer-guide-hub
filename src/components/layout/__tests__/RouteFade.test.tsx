/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RouteFade } from '../RouteFade';
import { isRouteMotionAllowed } from '../routeJourney';

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

describe('RouteFade', () => {
  it('does not hide the heading behind arrival motion on cold load', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <RouteFade>
          <h1>Homepage</h1>
        </RouteFade>
      </MemoryRouter>,
    );
    expect(container.firstChild).not.toHaveClass('station-arrive');
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
  });
  it('keeps admin and safety routes motion-free', () => {
    expect(isRouteMotionAllowed('/admin')).toBe(false);
    expect(isRouteMotionAllowed('/help')).toBe(false);
    expect(isRouteMotionAllowed('/rights/trans')).toBe(false);
    expect(isRouteMotionAllowed('/events')).toBe(true);
  });

  it.each(['/venues', '/community', '/cities', '/news'])(
    'never covers %s with a coloured loading overlay',
    (destination) => {
      const { container } = render(
        <MemoryRouter initialEntries={['/']}>
          <NavigationHarness destination={destination} />
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Ride' }));
      expect(screen.queryByTestId('route-journey')).not.toBeInTheDocument();
      expect(container.firstChild).toHaveClass('station-arrive');
      expect(container.firstChild).not.toHaveClass('station-arrive--journey');
      expect(screen.getByRole('button', { name: 'Ride' })).toBeVisible();
    },
  );

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
