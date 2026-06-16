/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ markAllAsRead: vi.fn() }),
}));
vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxFeed: () => ({ items: [], loading: false, unreadCount: 0 }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

import { NotificationList } from '../NotificationList';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('NotificationList', () => {
  it('renders', () => {
    const { container } = render(
      <QueryClientProvider client={client}>
        <NotificationList />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
