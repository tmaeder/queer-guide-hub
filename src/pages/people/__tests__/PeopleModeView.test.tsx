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

// Resolve `t(key, { defaultValue, ...vars })` the way the configured i18n does,
// interpolation included. Without this the score badge renders the literal
// "{{score}}% match" and the assertion below would silently pass on a string no
// user ever sees.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | Record<string, unknown>) => {
      if (typeof opts === 'string') return opts;
      const template = (opts?.defaultValue as string) ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(opts?.[name] ?? ''));
    },
  }),
}));

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
      React.createElement(PeopleModeView, {
        mode: 'friends',
        emptyState: React.createElement('p', null, 'Nobody yet.'),
      }),
    ),
  );

beforeEach(() => {
  auth.user = { id: 'me' };
  matches = [];
  loading = false;
  friendProfiles = [];
});

describe('PeopleModeView', () => {
  // Signed-out and no-matches deliberately render the SAME node. They used to
  // differ — signed-out got a bare "Sign in to find people." with no heading or
  // button, which was the whole signed-out state of a top-level nav intent —
  // and to a visitor both are just an empty page, so the caller now supplies one
  // honest state for both.
  it('renders the empty state when signed out', () => {
    auth.user = null;
    renderView();
    expect(screen.getByText('Nobody yet.')).toBeInTheDocument();
  });

  it('renders the empty state when there are no matches', () => {
    renderView();
    expect(screen.getByText('Nobody yet.')).toBeInTheDocument();
  });

  it('renders nothing while loading rather than flashing the empty state', () => {
    loading = true;
    const { container } = renderView();
    expect(screen.queryByText('Nobody yet.')).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length,
    ).toBeGreaterThan(0);
  });

  it('renders a ranked person grid', () => {
    matches = [{ userId: 'a', score: 88, shared: { mutual_friends: 1 } }];
    friendProfiles = [{ user_id: 'a', display_name: 'Robin', avatar_url: null }];
    renderView();
    expect(screen.getByText('Robin')).toBeInTheDocument();
    expect(screen.getByText('88% match')).toBeInTheDocument();
  });
});
