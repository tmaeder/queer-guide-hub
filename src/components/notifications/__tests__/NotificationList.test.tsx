/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ notifications: [], markAllRead: vi.fn(), markRead: vi.fn() }) }));
vi.mock('@/hooks/useMessaging', () => ({ useMessaging: () => ({ threads: [], markThreadRead: vi.fn() }) }));
vi.mock('@/hooks/useGroupNotifications', () => ({ useGroupNotifications: () => ({ notifications: [], markRead: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ fetchUserPostInteractions: vi.fn().mockResolvedValue([]) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

import { NotificationList } from '../NotificationList';

describe('NotificationList', () => {
  it('renders', () => {
    const { container } = render(<NotificationList />);
    expect(container).toBeTruthy();
  });
});
