/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePushSubscription', () => ({
  usePushSubscription: () => ({
    subscribed: false, subscribing: false, supported: true,
    subscribe: vi.fn(), unsubscribe: vi.fn(),
  }),
}));

// PushNotificationSettings reads profile.dm_push_enabled via useProfile, which
// pulls in useAuth/AuthProvider. Mock it so the component renders standalone.
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null, updateProfile: vi.fn() }),
}));

import { PushNotificationSettings } from '../PushNotificationSettings';

describe('PushNotificationSettings', () => {
  it('renders', () => {
    const { container } = render(<PushNotificationSettings />);
    expect(container).toBeTruthy();
  });
});
