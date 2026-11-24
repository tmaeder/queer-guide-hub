/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';

let error: string | null = null;

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
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
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
