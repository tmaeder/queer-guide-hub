import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Bell derives its badge from unread items in the alerts lens (not the
// total unreadCount RPC) since the 2026-07 declutter.
vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxFeed: () => ({
    unreadCount: 5,
    items: [
      { id: 'n1', unread: true },
      { id: 'n2', unread: true },
      { id: 'n3', unread: true },
      { id: 'n4', unread: true },
      { id: 'n5', unread: true },
      { id: 'n6', unread: false },
    ],
    loading: false,
  }),
}));

vi.mock('./NotificationList', () => ({
  NotificationList: () => <div data-testid="notification-list">Notifications</div>,
}));

import { NotificationBell } from '../NotificationBell';

describe('NotificationBell', () => {
  it('should render notification button', () => {
    render(<NotificationBell />);
    expect(screen.getByLabelText(/Notifications/)).toBeInTheDocument();
  });

  it('should show unread count badge', () => {
    render(<NotificationBell />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('should not render a mode selector', () => {
    render(<NotificationBell />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
