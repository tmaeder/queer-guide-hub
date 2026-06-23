import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import React from 'react';

const auth = { user: { id: 'me' } as { id: string } | null };
const statusMock = { visibility: { in_discovery: false } } as {
  visibility: { in_discovery: boolean };
} | null;
let matches: { userId: string; score: number; shared: Record<string, number> }[] = [];
let friendProfiles: { user_id: string; display_name: string; avatar_url: string | null }[] = [];
let lastDiscoveryArgs: Record<string, unknown> | null = null;

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useStatus', () => ({ useStatus: () => ({ status: statusMock }) }));
vi.mock('@/hooks/usePeopleDiscovery', () => ({
  usePeopleDiscovery: (args: Record<string, unknown>) => {
    lastDiscoveryArgs = args;
    return { data: matches, isLoading: false };
  },
}));
vi.mock('@/hooks/useFriendProfiles', () => ({
  useFriendProfiles: () => friendProfiles,
}));

import { PeopleHereRail } from '../PeopleHereRail';

const renderRail = () =>
  render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(PeopleHereRail, { mode: 'locals', cityId: 'city-1', title: 'Locals to meet' }),
    ),
  );

const renderRailWith = (props: { mode: 'locals' | 'travel'; eventId?: string; tripId?: string }) =>
  render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(PeopleHereRail, { title: 'People', ...props }),
    ),
  );

beforeEach(() => {
  auth.user = { id: 'me' };
  statusMock!.visibility.in_discovery = false;
  matches = [];
  friendProfiles = [];
  lastDiscoveryArgs = null;
});

describe('PeopleHereRail', () => {
  it('renders nothing on a place surface when the viewer has not opted into discovery (no leak)', () => {
    statusMock!.visibility.in_discovery = false;
    matches = [{ userId: 'a', score: 90, shared: {} }];
    friendProfiles = [{ user_id: 'a', display_name: 'Alex', avatar_url: null }];
    const { container } = renderRail();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the rail of people once opted in and matches exist', () => {
    statusMock!.visibility.in_discovery = true;
    matches = [{ userId: 'a', score: 90, shared: { mutual_friends: 1 } }];
    friendProfiles = [{ user_id: 'a', display_name: 'Alex', avatar_url: null }];
    renderRail();
    expect(screen.getByText('Locals to meet')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('90% match')).toBeInTheDocument();
  });

  it('renders nothing when opted in but there is no one to show', () => {
    statusMock!.visibility.in_discovery = true;
    matches = [];
    const { container } = renderRail();
    expect(container).toBeEmptyDOMElement();
  });

  it('forwards an event context to the discovery hook', () => {
    statusMock!.visibility.in_discovery = true;
    renderRailWith({ mode: 'locals', eventId: 'evt-1' });
    expect(lastDiscoveryArgs).toMatchObject({ mode: 'locals', eventId: 'evt-1', enabled: true });
  });

  it('treats a trip context as a place surface (hidden without discovery opt-in)', () => {
    statusMock!.visibility.in_discovery = false;
    matches = [{ userId: 'a', score: 70, shared: {} }];
    friendProfiles = [{ user_id: 'a', display_name: 'Alex', avatar_url: null }];
    const { container } = renderRailWith({ mode: 'travel', tripId: 'trip-1' });
    expect(container).toBeEmptyDOMElement();
    expect(lastDiscoveryArgs).toMatchObject({ mode: 'travel', tripId: 'trip-1', enabled: false });
  });
});
