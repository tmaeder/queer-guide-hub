import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxFeed: () => ({ unreadCount: 5, items: [], loading: false }),
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
