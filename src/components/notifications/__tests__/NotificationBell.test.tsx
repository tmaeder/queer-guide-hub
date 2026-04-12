import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: 5 }),
}));

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: { user_mode: 'exploration' },
    updateProfile: vi.fn(),
  }),
}));

vi.mock('./NotificationList', () => ({
  NotificationList: () => <div data-testid="notification-list">Notifications</div>,
}));

import { NotificationBell } from '../NotificationBell';

describe('NotificationBell', () => {
  it('should render notification button', () => {
    render(<NotificationBell />);
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });

  it('should show unread count badge', () => {
    render(<NotificationBell />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
