/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';

let error: string | null = null;
let user: { id: string } | null = { id: 'u1' };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, d?: string) => d ?? key }),
}));
vi.mock('@/hooks/useNearMe', () => ({
  useNearMe: () => ({
    supported: true,
    loading: false,
    error,
    goLive: vi.fn(),
    goInvisible: vi.fn(),
    liveStatus: null,
  }),
}));
vi.mock('../PeopleModeView', () => ({ PeopleModeView: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user }) }));
vi.mock('../NearbyMap', () => ({ NearbyMap: () => null }));
vi.mock('@/hooks/useIntimateProfile', () => ({ useMyIntimateProfile: () => ({ data: null }) }));
vi.mock('@/hooks/usePlaces', () => ({
  useOptimizedCities: () => ({ cities: [], loading: false }),
}));

import { NearbyView } from '../NearbyView';

describe('NearbyView go-live errors', () => {
  // A geolocation timeout / POSITION_UNAVAILABLE used to render nothing: the
  // button flipped back to "Go live" and the page looked broken.
  it('explains an unavailable location instead of failing silently', () => {
    error = 'unavailable';
    render(React.createElement(MemoryRouter, null, React.createElement(NearbyView)));
    expect(screen.getByText(/Could not get your location/)).toBeTruthy();
  });

  it('explains a blocked location and where to fix it', () => {
    error = 'denied';
    render(React.createElement(MemoryRouter, null, React.createElement(NearbyView)));
    expect(screen.getByText(/Location is blocked/)).toBeTruthy();
  });
});

describe('NearbyView signed out', () => {
  // The control asked the browser for a location and then failed at the server,
  // because presence is a member write. Signed-out visitors get sign-in instead.
  it('offers sign-in instead of the go-live control', () => {
    user = null;
    error = null;
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/meet/nearby'] },
        React.createElement(NearbyView),
      ),
    );
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/auth?redirect=%2Fmeet%2Fnearby');
    expect(screen.queryByRole('button', { name: /Go live/ })).toBeNull();
    user = { id: 'u1' };
  });
});
