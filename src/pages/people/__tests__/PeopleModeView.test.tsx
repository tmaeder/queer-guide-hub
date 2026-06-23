/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import React from 'react';

const auth = { user: { id: 'me' } as { id: string } | null };
let matches: { userId: string; score: number; shared: Record<string, number> }[] = [];
let loading = false;
let friendProfiles: { user_id: string; display_name: string; avatar_url: string | null }[] = [];

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/usePeopleDiscovery', () => ({
  usePeopleDiscovery: () => ({ data: matches, isLoading: loading }),
}));
vi.mock('@/hooks/useFriendProfiles', () => ({ useFriendProfiles: () => friendProfiles }));

import { PeopleModeView } from '../PeopleModeView';

const renderView = () =>
  render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(PeopleModeView, { mode: 'friends', emptyHint: 'Nobody yet.' }),
    ),
  );

beforeEach(() => {
  auth.user = { id: 'me' };
  matches = [];
  loading = false;
  friendProfiles = [];
});

describe('PeopleModeView', () => {
  it('prompts sign-in when signed out', () => {
    auth.user = null;
    renderView();
    expect(screen.getByText('Sign in to find people.')).toBeInTheDocument();
  });

  it('shows the empty hint when there are no matches', () => {
    renderView();
    expect(screen.getByText('Nobody yet.')).toBeInTheDocument();
  });

  it('renders a ranked person grid', () => {
    matches = [{ userId: 'a', score: 88, shared: { mutual_friends: 1 } }];
    friendProfiles = [{ user_id: 'a', display_name: 'Robin', avatar_url: null }];
    renderView();
    expect(screen.getByText('Robin')).toBeInTheDocument();
    expect(screen.getByText('88% match')).toBeInTheDocument();
  });
});
