import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  counts: { all: 0, chats: 0, mail: 0, alerts: 0, matches: 0, groups: 0, trips: 0 },
  realtime: vi.fn(),
}));

vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxUnreadCounts: () => h.counts,
  useInboxRealtime: () => h.realtime(),
  useInboxFeed: () => ({ items: [], loading: false }),
}));
// The panel is covered by SignalPanel.test.tsx.
vi.mock('../SignalPanel', () => ({
  SignalPanel: () => <div data-testid="signal-panel" />,
  SafetyNotices: () => null,
  SignalRow: () => null,
}));

import { HeaderInbox } from '../HeaderInbox';

describe('HeaderInbox', () => {
  beforeEach(() => {
    h.counts = { all: 0, chats: 0, mail: 0, alerts: 0, matches: 0, groups: 0, trips: 0 };
    h.realtime.mockClear();
  });

  it('is labelled Inbox with no badge when nothing is unread', () => {
    render(<HeaderInbox />);
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('badges the total across messages and alerts', () => {
    h.counts = { ...h.counts, all: 7, chats: 4, alerts: 3 };
    render(<HeaderInbox />);
    expect(screen.getByRole('button', { name: /^Inbox, .*unread/ })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('caps the badge at 99+', () => {
    h.counts = { ...h.counts, all: 150, chats: 150 };
    render(<HeaderInbox />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('mounts the inbox realtime channel', () => {
    render(<HeaderInbox />);
    expect(h.realtime).toHaveBeenCalled();
  });
});
