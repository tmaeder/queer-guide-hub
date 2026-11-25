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

  it('opens one menu with the inbox and every Hub section, Today included', async () => {
    renderHub();
    await userEvent.click(screen.getByRole('button', { name: 'Hub' }));
    expect(screen.getByRole('tab', { name: 'Messages' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alerts' })).toBeInTheDocument();
    const hrefs = screen.getAllByRole('link').map((el) => el.getAttribute('href'));
    for (const path of ['/hub', '/hub/plans', '/hub/saved', '/hub/friends', '/hub/feed']) {
      expect(hrefs).toContain(path);
    }
  });
});
