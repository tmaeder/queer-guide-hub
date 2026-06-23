/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import React from 'react';

const profile = { user_mode: null as string | null };

vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile }) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
// Stub the heavy children so we only test the hub's tab selection.
vi.mock('../PeopleModeView', () => ({
  PeopleModeView: ({ mode }: { mode: string }) => <div data-testid="mode-view">{mode}</div>,
}));
vi.mock('@/pages/intimate/IntimateDiscovery', () => ({
  default: () => <div data-testid="dating-deck">dating</div>,
}));
vi.mock('@/components/people/IntentSheet', () => ({
  IntentSheet: () => null,
}));
vi.mock('../NearbyView', () => ({
  NearbyView: () => <div data-testid="nearby-view">nearby</div>,
}));

import People from '../People';

const renderHub = (tab?: 'friends' | 'dating' | 'travel' | 'nearby') =>
  render(React.createElement(MemoryRouter, null, React.createElement(People, { tab })));

beforeEach(() => {
  profile.user_mode = null;
});

describe('People hub', () => {
  it('defaults to the friends mode when user_mode is unset', () => {
    renderHub();
    expect(screen.getByTestId('mode-view')).toHaveTextContent('friends');
  });

  it("opens the dating deck first for a user whose mode is 'dating'", async () => {
    profile.user_mode = 'dating';
    renderHub();
    // The dating deck is lazy-loaded behind Suspense.
    expect(await screen.findByTestId('dating-deck')).toBeInTheDocument();
  });

  it('maps exploration -> travel mode view', () => {
    profile.user_mode = 'exploration';
    renderHub();
    expect(screen.getByTestId('mode-view')).toHaveTextContent('travel');
  });

  it('honors an explicit tab prop over the default', () => {
    profile.user_mode = 'dating';
    renderHub('nearby');
    expect(screen.getByTestId('nearby-view')).toBeInTheDocument();
  });
});
