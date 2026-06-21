/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/usePushSubscription', () => ({
  usePushSubscription: () => ({
    subscribed: false, subscribing: false, supported: true,
    subscribe: vi.fn(), unsubscribe: vi.fn(),
  }),
}));

// The component reads dm_push_enabled via useProfile, which calls useAuth +
// useQuery. Mock useProfile for the direct path, and also mock useAuth so that
// if the real useProfile runs (module-mock ordering differs under the full
// coverage suite vs. isolation) it gets a user instead of throwing
// "must be used within an AuthProvider". The QueryClientProvider covers the
// real useProfile's useQuery in that fallback case.
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null, updateProfile: vi.fn() }),
  profileQueryKey: (userId: string | null | undefined) => ['profile', userId],
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { PushNotificationSettings } from '../PushNotificationSettings';

describe('PushNotificationSettings', () => {
  it('renders', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <PushNotificationSettings />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
