import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const h = vi.hoisted(() => ({
  counts: { all: 0, chats: 0, mail: 0, alerts: 0, matches: 0, groups: 0, trips: 0 },
  realtime: vi.fn(),
}));

vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxUnreadCounts: () => h.counts,
  useInboxRealtime: () => h.realtime(),
  useInboxFeed: () => ({ items: [], loading: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('@/hooks/useInboxBadge', () => ({ useInboxBadge: () => 0 }));
vi.mock('@/components/people/GoLiveSwitch', () => ({ GoLiveSwitch: () => null }));
vi.mock('@/components/status/StatusEditor', () => ({ StatusEditor: () => null }));
vi.mock('@/components/notifications/MessagesPeek', () => ({
  MessagesPeek: () => <div data-testid="peek-messages" />,
}));
// Each section preview has its own data hooks; here only which one mounts matters.
vi.mock('../HubPeeks', () => {
  const peek = (id: string) => (p: { openLabel: string }) => (
    <div data-testid={`peek-${id}`}>{p.openLabel}</div>
  );
  return {
    PlansPeek: peek('plans'),
    SavedPeek: peek('saved'),
    FriendsPeek: peek('friends'),
    FeedPeek: peek('feed'),
    NextMissionRow: () => <div data-testid="next-mission" />,
  };
});
// The panels are covered by SignalPanel.test.tsx.
vi.mock('@/components/notifications/SignalPanel', () => ({
  SignalPanel: () => <div data-testid="signal-panel" />,
  SafetyNotices: () => null,
  SignalRow: () => null,
}));

import { HeaderHub } from '../HubMenu';

const renderHub = () =>
  render(
    <MemoryRouter>
      <HeaderHub />
    </MemoryRouter>,
  );

describe('HeaderHub', () => {
  beforeEach(() => {
    h.counts = { all: 0, chats: 0, mail: 0, alerts: 0, matches: 0, groups: 0, trips: 0 };
    h.realtime.mockClear();
  });

  it('is labelled Hub with no badge when nothing is unread', () => {
    renderHub();
    expect(screen.getByRole('button', { name: 'Hub' })).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('badges the total across messages and alerts', () => {
    h.counts = { ...h.counts, all: 7, chats: 4, alerts: 3 };
    renderHub();
    expect(screen.getByRole('button', { name: /^Hub, .*unread/ })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('caps the badge at 99+', () => {
    h.counts = { ...h.counts, all: 150, chats: 150 };
    renderHub();
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('mounts the inbox realtime channel', () => {
    renderHub();
    expect(h.realtime).toHaveBeenCalled();
  });

  it('opens one menu with tabs for the inbox and the Hub sections (no Today, no Progress) and Contribute, in order', async () => {
    renderHub();
    await userEvent.click(screen.getByRole('button', { name: 'Hub' }));
    const tabs = screen.getAllByRole('tab').map((el) => el.textContent);
    expect(tabs).toEqual(['Messages', 'Alerts', 'Plans', 'Saved', 'Friends', 'Feed', 'Contribute']);
  });

  it('has no Today tab; opens on Messages when nothing is unread; a tab shows its section', async () => {
    renderHub();
    await userEvent.click(screen.getByRole('button', { name: 'Hub' }));
    expect(screen.queryByRole('tab', { name: 'Today' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Messages' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Saved' }));
    expect(screen.getByTestId('peek-saved')).toHaveTextContent('Saved');
    expect(screen.queryByTestId('peek-messages')).toBeNull();
  });

  it('opens on Messages even when only alerts are unread', async () => {
    h.counts = { ...h.counts, all: 3, alerts: 3 };
    renderHub();
    await userEvent.click(screen.getByRole('button', { name: /^Hub/ }));
    expect(screen.getByRole('tab', { name: /^Messages/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('peek-messages')).toBeInTheDocument();
  });

  it('opens on Messages when there are unread messages', async () => {
    h.counts = { ...h.counts, all: 2, chats: 2 };
    renderHub();
    await userEvent.click(screen.getByRole('button', { name: /^Hub/ }));
    expect(screen.getByRole('tab', { name: /^Messages/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('peek-messages')).toBeInTheDocument();
  });
});
